"""Sensori facoltativi, per utente.

Le entità di Home Assistant sono visibili a TUTTI gli utenti: per questo ogni
utente decide dal pannello (Impostazioni) se crearle per i propri dati.
"""
from __future__ import annotations

from typing import Any, Callable

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import slugify

from . import logic
from .const import DOMAIN, SIGNAL_ANY
from .i18n import attr
from .manager import FinanceTrackerManager


def _month_totals(m: FinanceTrackerManager) -> dict:
    today = m.today()
    return logic.period_totals(m.data["movements"], *logic.month_bounds(today.year, today.month))


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry,
                            async_add_entities: AddEntitiesCallback) -> None:
    registry = entry.runtime_data.registry
    created: dict[str, set[str]] = {}  # user_id -> unique_id creati
    ent_reg = er.async_get(hass)

    def build(manager: FinanceTrackerManager) -> list[FinanceTrackerSensor]:
        uid = manager.user_id
        device = DeviceInfo(
            identifiers={(DOMAIN, f"{entry.entry_id}_{uid}")},
            name=f"FinanceTracker {manager.user_name}".strip(),
            manufacturer="FinanceTracker",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url="/financetracker",
        )
        known = created.setdefault(uid, set())
        a = lambda key: attr(hass, key)  # noqa: E731 - nome attributo nella lingua di HA

        def mk(key: str, translation_key: str, icon: str, value: Callable[[], Any],
               attrs: Callable[[], dict] | None = None, monetary: bool = True,
               placeholders: dict[str, str] | None = None) -> FinanceTrackerSensor | None:
            unique = f"{entry.entry_id}_{uid}_{key}"
            if unique in known:
                return None
            known.add(unique)
            return FinanceTrackerSensor(manager, device, unique, translation_key, placeholders,
                                 icon, value, attrs, monetary)

        def month_bounds():
            return logic.month_bounds(manager.today().year, manager.today().month)

        items = [
            mk("saldo_totale", "total_balance", "mdi:wallet",
               lambda: round(sum(logic.account_balances(manager.data).values()), 2),
               lambda: {a("accounts"): logic.account_balances(manager.data)}),
            mk("entrate_mese", "income_month", "mdi:arrow-down-bold-circle",
               lambda: _month_totals(manager)["entrate"]),
            mk("uscite_mese", "expenses_month", "mdi:arrow-up-bold-circle",
               lambda: _month_totals(manager)["uscite"],
               lambda: {a("by_category"): logic.expenses_by_category(manager.data["movements"], *month_bounds())}),
            mk("netto_mese", "net_month", "mdi:scale-balance",
               lambda: _month_totals(manager)["netto"]),
            mk("spese_fisse_mensili", "recurring_monthly", "mdi:calendar-sync",
               lambda: logic.recurring_monthly_total(manager.data["recurring"])),
            mk("scadenze", "recurring_due", "mdi:bell-ring",
               lambda: len(logic.recurring_due(manager.data["recurring"], manager.today())),
               lambda: {a("items"): [
                   {a("name"): r["name"], a("amount"): r["amount"], a("due"): r["next_due"]}
                   for r in logic.recurring_due(manager.data["recurring"], manager.today())]},
               monetary=False),
        ]
        for acc in manager.data["accounts"]:
            name = acc["name"]
            items.append(mk(f"saldo_{slugify(name)}", "account_balance", "mdi:bank",
                            lambda n=name: logic.account_balances(manager.data).get(n),
                            placeholders={"account": name}))
        return [e for e in items if e is not None]

    entities: list[FinanceTrackerSensor] = []
    for manager in registry.managers.values():
        if manager.settings.get("sensors"):
            entities += build(manager)
    async_add_entities(entities)

    # rimuove le entità di chi ha disattivato i sensori (o rinominato un conto)
    wanted = {u for s in created.values() for u in s}
    for ent in er.async_entries_for_config_entry(ent_reg, entry.entry_id):
        if ent.unique_id not in wanted:
            ent_reg.async_remove(ent.entity_id)

    @callback
    def on_update(user_id: str) -> None:
        manager = registry.managers.get(user_id)
        if manager is None:
            return
        enabled = bool(manager.settings.get("sensors"))
        had = bool(created.get(user_id))
        if enabled and (new := build(manager)):
            async_add_entities(new)
        elif had and not enabled:
            hass.config_entries.async_schedule_reload(entry.entry_id)

    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_ANY, on_update))


class FinanceTrackerSensor(SensorEntity):
    _attr_has_entity_name = True
    _attr_should_poll = True  # aggiorna anche al cambio di giorno / mese

    def __init__(self, manager: FinanceTrackerManager, device: DeviceInfo, unique_id: str,
                 translation_key: str, placeholders: dict[str, str] | None, icon: str,
                 value: Callable[[], Any], attrs: Callable[[], dict] | None, monetary: bool) -> None:
        self._manager = manager
        self._value = value
        self._attrs = attrs
        self._attr_unique_id = unique_id
        # nome (e quindi entity_id) creato da Home Assistant nella lingua del sistema
        self._attr_translation_key = translation_key
        if placeholders:
            self._attr_translation_placeholders = placeholders
        self._attr_icon = icon
        self._attr_device_info = device
        if monetary:
            self._attr_device_class = SensorDeviceClass.MONETARY
            self._attr_suggested_display_precision = 2

    @property
    def native_unit_of_measurement(self) -> str | None:
        # valuta dell'archivio dell'utente (quella di Home Assistant se non scelta)
        return self._manager.currency if self._attr_device_class == SensorDeviceClass.MONETARY else None

    @property
    def native_value(self) -> Any:
        return self._value()

    @property
    def extra_state_attributes(self) -> dict | None:
        return self._attrs() if self._attrs else None

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, self._manager.signal, self.async_write_ha_state))
