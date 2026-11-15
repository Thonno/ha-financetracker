"""Promemoria delle spese fisse: notifica con i pulsanti Registra / Salta.

Ogni utente sceglie dal pannello su quali dispositivi riceverli; le notifiche
riguardano solo le sue spese fisse.
"""
from __future__ import annotations

import logging
from datetime import time

from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later, async_track_time_change

from . import logic
from .logic import money
from .i18n import language, tr
from .const import ACTION_REGISTER, ACTION_SKIP, PANEL_URL
from .manager import FinanceTrackerError, FinanceTrackerManager, FinanceTrackerRegistry

_LOGGER = logging.getLogger(__name__)


class Reminders:
    """Controlla ogni giorno le scadenze e gestisce le risposte dalle notifiche."""

    def __init__(self, hass: HomeAssistant, registry: FinanceTrackerRegistry, notify_time: str) -> None:
        self.hass = hass
        self.registry = registry
        self.at = time.fromisoformat(notify_time)
        self._unsubs: list[CALLBACK_TYPE] = []

    @callback
    def start(self) -> None:
        self._unsubs.append(async_track_time_change(
            self.hass, self._tick, hour=self.at.hour, minute=self.at.minute, second=0))
        self._unsubs.append(self.hass.bus.async_listen(
            "mobile_app_notification_action", self._on_action))
        self._unsubs.append(async_call_later(self.hass, 60, self._tick))
        # interessi: ogni notte e subito all'avvio (recupera i giorni persi)
        self._unsubs.append(async_track_time_change(self.hass, self._interest, hour=0, minute=5, second=0))
        self._unsubs.append(async_call_later(self.hass, 20, self._interest))

    @callback
    def stop(self) -> None:
        while self._unsubs:
            self._unsubs.pop()()

    async def _interest(self, _now=None) -> None:
        for manager in list(self.registry.managers.values()):
            try:
                manager.accrue_interest()
            except Exception:  # noqa: BLE001 - un archivio con problemi non blocca gli altri
                _LOGGER.exception("Calcolo interessi non riuscito per %s", manager.user_name)

    async def _tick(self, _now=None) -> None:
        for manager in list(self.registry.managers.values()):
            services = _services(manager)
            if not services:
                continue
            for item in logic.recurring_due(manager.data["recurring"], manager.today()):
                if item.get("notified_for") == item["next_due"]:
                    continue
                await self._send(manager, services, item)
                await manager.mark_notified(item)

    async def _send(self, manager: FinanceTrackerManager, services: list[str], item: dict) -> None:
        due = logic.parse_date(item["next_due"])
        lang = language(self.hass)
        when = f"{due:%d/%m}" if lang == "it" else f"{due:%d %b}"
        message = f"{item['name']} · {money(float(item['amount']), manager.currency, lang)} · {when}"
        if item.get("account"):
            message += f" ({item['account']})"
        data = {
            "tag": f"financetracker_{item['id']}",
            "group": "financetracker",
            "url": f"/{PANEL_URL}",
            "clickAction": f"/{PANEL_URL}",
            "actions": [
                {"action": f"{ACTION_REGISTER}{item['id']}", "title": tr(self.hass, "notify_register")},
                {"action": f"{ACTION_SKIP}{item['id']}", "title": tr(self.hass, "notify_skip"),
                 "destructive": True},
            ],
        }
        for service in services:
            try:
                await self.hass.services.async_call(
                    "notify", service,
                    {"title": tr(self.hass, "notify_title"), "message": message, "data": data},
                    blocking=True,
                )
            except Exception as err:  # noqa: BLE001 - una notifica fallita non deve bloccare le altre
                _LOGGER.warning("Notifica %s non inviata: %s", service, err)

    async def _clear(self, services: list[str], item_id: str) -> None:
        for service in services:
            try:
                await self.hass.services.async_call(
                    "notify", service,
                    {"message": "clear_notification", "data": {"tag": f"financetracker_{item_id}"}},
                    blocking=False,
                )
            except Exception:  # noqa: BLE001
                pass

    async def _on_action(self, event: Event) -> None:
        action = str(event.data.get("action", ""))
        if not action.startswith((ACTION_REGISTER, ACTION_SKIP)):
            return
        item_id = action.removeprefix(ACTION_REGISTER).removeprefix(ACTION_SKIP)
        manager = self.registry.find_item_owner(item_id)
        if manager is None:
            return
        # la risposta deve arrivare dall'utente proprietario della spesa
        if event.context.user_id and event.context.user_id != manager.user_id:
            _LOGGER.warning("Azione %s ignorata: arriva da un altro utente", action)
            return
        try:
            item = manager.find_recurring(item_id)
            if item not in logic.recurring_due(manager.data["recurring"], manager.today()):
                return  # già gestita da un altro dispositivo o dal pannello
            if action.startswith(ACTION_REGISTER):
                await manager.register_recurring(item_id, user=manager.user_name)
            else:
                await manager.skip_recurring(item_id)
        except FinanceTrackerError as err:
            _LOGGER.warning("Azione %s ignorata: %s", action, err)
            return
        await self._clear(_services(manager), item_id)
