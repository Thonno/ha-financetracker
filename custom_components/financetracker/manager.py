"""Archivio dati e operazioni dell'integrazione FinanceTracker."""
from __future__ import annotations

import copy
import re
import uuid
from datetime import date
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import logic
from .i18n import defaults, tr
from .const import DEFAULT_DATA, INDEX_KEY, SIGNAL_ANY, SIGNAL_UPDATED, STORAGE_KEY, STORAGE_VERSION

MOVEMENT_FIELDS = (
    "date", "type", "amount", "category", "description", "method",
    "account", "to_account", "note",
)
RECURRING_FIELDS = (
    "name", "amount", "category", "cadence_months", "method", "account",
    "day_of_month", "next_due", "end_date", "active", "to_verify",
)


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


class FinanceTrackerError(HomeAssistantError):
    """Errore mostrato all'utente."""


class FinanceTrackerManager:
    """Dati di UN utente, salvati in .storage/financetracker.user_<id utente>."""

    def __init__(self, hass: HomeAssistant, user_id: str, user_name: str = "") -> None:
        self.hass = hass
        self.user_id = user_id
        self.user_name = user_name
        self.signal = SIGNAL_UPDATED.format(user_id)
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY.format(user_id))
        self.data: dict[str, Any] = {**copy.deepcopy(DEFAULT_DATA), **copy.deepcopy(defaults(hass))}

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if stored:
            for key, default in DEFAULT_DATA.items():
                stored.setdefault(key, copy.deepcopy(default))
            for key, default in DEFAULT_DATA["settings"].items():
                stored["settings"].setdefault(key, copy.deepcopy(default))
            self.data = stored

    @property
    def settings(self) -> dict[str, Any]:
        return self.data["settings"]

    @property
    def currency(self) -> str:
        """Valuta dell'archivio: scelta dall'utente, altrimenti quella di Home Assistant."""
        return self.settings.get("currency") or getattr(self.hass.config, "currency", None) or "EUR"

    async def _commit(self) -> None:
        self.data["movements"].sort(key=lambda m: (m["date"], m.get("created_at", "")))
        await self._store.async_save(self.data)
        async_dispatcher_send(self.hass, self.signal)
        async_dispatcher_send(self.hass, SIGNAL_ANY, self.user_id)

    # ------------------------------------------------------------------ helpers
    def today(self) -> date:
        return dt_util.now().date()

    def _find(self, key: str, item_id: str) -> dict:
        for item in self.data[key]:
            if item["id"] == item_id:
                return item
        raise FinanceTrackerError(tr(self.hass, "not_found", ref=item_id))

    def find_recurring(self, ref: str) -> dict:
        for item in self.data["recurring"]:
            if item["id"] == ref or item["name"].lower() == str(ref).lower():
                return item
        raise FinanceTrackerError(tr(self.hass, "recurring_not_found", ref=ref))

    def _account_names(self) -> list[str]:
        return [a["name"] for a in self.data["accounts"]]

    def _clean_movement(self, raw: dict, base: dict | None = None) -> dict:
        m = dict(base or {})
        for key in MOVEMENT_FIELDS:
            if key in raw and raw[key] is not None:
                m[key] = raw[key]
        m["type"] = str(m.get("type", logic.TIPO_USCITA)).lower()
        if m["type"] not in logic.TIPI:
            raise FinanceTrackerError(tr(self.hass, "bad_type", type=m["type"]))
        try:
            m["amount"] = round(abs(float(str(m.get("amount", "")).replace(",", "."))), 2)
        except ValueError as err:
            raise FinanceTrackerError(tr(self.hass, "bad_amount")) from err
        if m["amount"] <= 0:
            raise FinanceTrackerError(tr(self.hass, "amount_positive"))
        m["date"] = logic.parse_date(m.get("date") or self.today()).isoformat()
        for key in ("category", "description", "method", "account", "to_account", "note"):
            m[key] = str(m.get(key) or "").strip()
        accounts = self._account_names()
        if not m["account"] and accounts:
            m["account"] = accounts[0]
        if m["account"] not in accounts:
            raise FinanceTrackerError(tr(self.hass, "unknown_account", account=m["account"]))
        if m["type"] == logic.TIPO_TRASFERIMENTO:
            if m["to_account"] not in accounts or m["to_account"] == m["account"]:
                raise FinanceTrackerError(tr(self.hass, "transfer_accounts"))
        else:
            m["to_account"] = ""
        return m

    # ---------------------------------------------------------------- movements
    async def add_movement(self, raw: dict, user: str | None = None) -> dict:
        m = self._clean_movement(raw)
        m["id"] = _new_id()
        m["created_by"] = user or ""
        m["created_at"] = dt_util.utcnow().isoformat()
        if raw.get("recurring_id"):
            m["recurring_id"] = raw["recurring_id"]
        for key, value in (("categories", m["category"]), ("methods", m["method"])):
            if value and value not in self.data[key]:
                self.data[key].append(value)
        self.data["movements"].append(m)
        await self._commit()
        return m

    async def update_movement(self, movement_id: str, raw: dict) -> dict:
        current = self._find("movements", movement_id)
        updated = self._clean_movement(raw, current)
        current.update(updated)
        await self._commit()
        return current

    async def delete_movement(self, movement_id: str) -> None:
        current = self._find("movements", movement_id)
        self.data["movements"].remove(current)
        await self._commit()

    # ----------------------------------------------------------------- settings
    async def save_settings(self, accounts: list[dict], categories: list[str],
                            methods: list[str], renames: dict[str, dict[str, str]]) -> None:
        names = [str(a["name"]).strip() for a in accounts]
        if not names or any(not n for n in names) or len(set(names)) != len(names):
            raise FinanceTrackerError(tr(self.hass, "account_names"))
        ren_acc = renames.get("accounts", {})
        ren_cat = renames.get("categories", {})
        ren_met = renames.get("methods", {})
        for m in self.data["movements"]:
            m["account"] = ren_acc.get(m["account"], m["account"])
            if m.get("to_account"):
                m["to_account"] = ren_acc.get(m["to_account"], m["to_account"])
            m["category"] = ren_cat.get(m["category"], m["category"])
            m["method"] = ren_met.get(m["method"], m["method"])
        for r in self.data["recurring"]:
            r["account"] = ren_acc.get(r.get("account", ""), r.get("account", ""))
            r["category"] = ren_cat.get(r.get("category", ""), r.get("category", ""))
            r["method"] = ren_met.get(r.get("method", ""), r.get("method", ""))
        self.data["accounts"] = [
            {"name": str(a["name"]).strip(),
             "initial_balance": round(float(a.get("initial_balance") or 0), 2),
             "hidden": bool(a.get("hidden", False))}
            for a in accounts
        ]
        self.data["categories"] = [c.strip() for c in categories if str(c).strip()]
        self.data["methods"] = [c.strip() for c in methods if str(c).strip()]
        await self._commit()

    async def save_prefs(self, notify_services: list[str] | None = None,
                         sensors: bool | None = None, theme: str | None = None,
                         currency: str | None | bool = False) -> dict:
        if notify_services is not None:
            self.settings["notify_services"] = [str(s) for s in notify_services]
        if sensors is not None:
            self.settings["sensors"] = bool(sensors)
        if theme in ("auto", "light", "dark"):
            self.settings["theme"] = theme
        if currency is not False:  # None / "" = segui Home Assistant
            code = str(currency or "").strip().upper()
            if code and not re.fullmatch(r"[A-Z]{3}", code):
                raise FinanceTrackerError(tr(self.hass, "bad_currency", code=code))
            self.settings["currency"] = code or None
        await self._commit()
        return self.settings

    # ---------------------------------------------------------------- recurring
    async def save_recurring(self, raw: dict) -> dict:
        item = self._find("recurring", raw["id"]) if raw.get("id") else {"id": _new_id()}
        for key in RECURRING_FIELDS:
            if key in raw:
                item[key] = raw[key]
        item["name"] = str(item.get("name") or "").strip()
        if not item["name"]:
            raise FinanceTrackerError(tr(self.hass, "recurring_name"))
        item["amount"] = round(abs(float(item.get("amount") or 0)), 2)
        item["cadence_months"] = int(item.get("cadence_months") or 1)
        due = logic.parse_date(item.get("next_due") or self.today())
        item["next_due"] = due.isoformat()
        item["day_of_month"] = int(item.get("day_of_month") or due.day)
        item["end_date"] = (
            logic.parse_date(item["end_date"]).isoformat() if item.get("end_date") else None
        )
        item["active"] = bool(item.get("active", True))
        item["to_verify"] = False
        item.pop("notified_for", None)
        if item not in self.data["recurring"]:
            self.data["recurring"].append(item)
        await self._commit()
        return item

    async def delete_recurring(self, item_id: str) -> None:
        self.data["recurring"].remove(self._find("recurring", item_id))
        await self._commit()

    async def register_recurring(self, ref: str, on: str | None = None,
                                 amount: float | None = None, user: str | None = None) -> dict:
        item = self.find_recurring(ref)
        when = logic.parse_date(on or item["next_due"])
        raw = logic.movement_from_recurring(item, when)
        if amount:
            raw["amount"] = amount
        movement = await self.add_movement(raw, user)
        logic.advance_recurring(item)
        item.pop("notified_for", None)
        await self._commit()
        return movement

    async def skip_recurring(self, ref: str) -> dict:
        item = self.find_recurring(ref)
        logic.advance_recurring(item)
        item.pop("notified_for", None)
        await self._commit()
        return item

    async def mark_notified(self, item: dict) -> None:
        item["notified_for"] = item["next_due"]
        await self._store.async_save(self.data)

    # ------------------------------------------------------------ import/export
    async def import_data(self, payload: dict, mode: str = "replace") -> dict[str, int]:
        if payload.get("format") not in ("financetracker", "finanze"):
            raise FinanceTrackerError(tr(self.hass, "bad_file"))
        if mode == "replace":
            settings = self.data["settings"]
            self.data = {key: copy.deepcopy(payload.get(key, DEFAULT_DATA[key])) for key in DEFAULT_DATA}
            self.data["settings"] = settings  # le preferenze dell'utente non arrivano dal file
        else:
            existing = {a["name"] for a in self.data["accounts"]}
            for acc in payload.get("accounts", []):
                if acc["name"] not in existing:
                    self.data["accounts"].append(acc)
            for key in ("categories", "methods"):
                for value in payload.get(key, []):
                    if value not in self.data[key]:
                        self.data[key].append(value)
            for key in ("movements", "recurring"):
                for item in payload.get(key, []):
                    new = dict(item)
                    new["id"] = _new_id()
                    self.data[key].append(new)
        for key in ("movements", "recurring"):
            for item in self.data[key]:
                item.setdefault("id", _new_id())
        await self._commit()
        return {"movimenti": len(self.data["movements"]), "spese_fisse": len(self.data["recurring"])}

    def export_data(self) -> dict:
        out = {"format": "financetracker", "version": 1, **copy.deepcopy(self.data)}
        out.pop("settings", None)
        return out


class FinanceTrackerRegistry:
    """Un archivio separato per ogni utente di Home Assistant."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.managers: dict[str, FinanceTrackerManager] = {}
        self._index: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, INDEX_KEY)
        self._known: list[str] = []

    async def async_load(self) -> None:
        index = await self._index.async_load() or {}
        self._known = list(index.get("users", []))
        for user_id in self._known:
            user = await self.hass.auth.async_get_user(user_id)
            if user is None:
                continue  # utente eliminato: il file resta, ma non viene caricato
            await self._load(user_id, user.name or "")

    async def _load(self, user_id: str, name: str) -> FinanceTrackerManager:
        manager = FinanceTrackerManager(self.hass, user_id, name)
        await manager.async_load()
        self.managers[user_id] = manager
        return manager

    async def get(self, user_id: str | None) -> FinanceTrackerManager:
        if not user_id:
            raise FinanceTrackerError(tr(self.hass, "unknown_user"))
        if user_id in self.managers:
            return self.managers[user_id]
        user = await self.hass.auth.async_get_user(user_id)
        if user is None or user.system_generated:
            raise FinanceTrackerError(tr(self.hass, "invalid_user"))
        manager = await self._load(user_id, user.name or "")
        if user_id not in self._known:
            self._known.append(user_id)
            await self._index.async_save({"users": self._known})
        return manager

    async def get_by_name(self, name: str) -> FinanceTrackerManager:
        wanted = name.strip().lower()
        for user in await self.hass.auth.async_get_users():
            if not user.system_generated and (user.name or "").strip().lower() == wanted:
                return await self.get(user.id)
        raise FinanceTrackerError(tr(self.hass, "no_such_user", name=name))

    def find_item_owner(self, item_id: str) -> FinanceTrackerManager | None:
        for manager in self.managers.values():
            if any(r["id"] == item_id for r in manager.data["recurring"]):
                return manager
        return None
