"""API WebSocket usata dal pannello."""
from __future__ import annotations

from typing import Any, Awaitable, Callable

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DOMAIN, VERSION
from .i18n import tr
from .manager import FinanceTrackerError, FinanceTrackerManager, FinanceTrackerRegistry

ANY_DICT = vol.Schema({}, extra=vol.ALLOW_EXTRA)


async def _manager(hass: HomeAssistant, connection: websocket_api.ActiveConnection) -> FinanceTrackerManager:
    registry: FinanceTrackerRegistry | None = hass.data.get(DOMAIN)
    if registry is None:
        raise FinanceTrackerError(tr(hass, "not_configured"))
    # ogni utente vede e modifica solo il proprio archivio
    return await registry.get(connection.user.id if connection.user else None)


def _snapshot(manager: FinanceTrackerManager) -> dict[str, Any]:
    return {**manager.data, "today": manager.today().isoformat(), "version": VERSION,
            "user": manager.user_name, "currency": manager.currency,
            "ha_currency": getattr(manager.hass.config, "currency", None) or "EUR"}


def _user(connection: websocket_api.ActiveConnection) -> str:
    return connection.user.name if connection.user and connection.user.name else ""


def _handler(
    command: str, schema: dict, func: Callable[[FinanceTrackerManager, dict, str], Awaitable[Any]]
) -> Callable:
    @websocket_api.websocket_command({vol.Required("type"): command, **schema})
    @websocket_api.async_response
    async def handle(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
        try:
            result = await func(await _manager(hass, connection), msg, _user(connection))
        except (FinanceTrackerError, ValueError, KeyError) as err:
            connection.send_error(msg["id"], "financetracker_error", str(err))
            return
        connection.send_result(msg["id"], result)

    return handle


@websocket_api.websocket_command({vol.Required("type"): "financetracker/subscribe"})
@websocket_api.async_response
async def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Invia i dati dell'utente subito e a ogni modifica (anche da un altro dispositivo)."""
    try:
        manager = await _manager(hass, connection)
    except FinanceTrackerError as err:
        connection.send_error(msg["id"], "not_loaded", str(err))
        return
    user_id = manager.user_id

    @callback
    def forward() -> None:
        registry = hass.data.get(DOMAIN)
        current = registry.managers.get(user_id, manager) if registry else manager
        connection.send_message(websocket_api.event_message(msg["id"], _snapshot(current)))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, manager.signal, forward)
    connection.send_result(msg["id"])
    forward()


async def _add(m: FinanceTrackerManager, msg: dict, user: str):
    return await m.add_movement(msg["movement"], user)


async def _update(m: FinanceTrackerManager, msg: dict, user: str):
    return await m.update_movement(msg["id_movimento"], msg["movement"])


async def _delete(m: FinanceTrackerManager, msg: dict, user: str):
    await m.delete_movement(msg["id_movimento"])
    return None


async def _settings(m: FinanceTrackerManager, msg: dict, user: str):
    await m.save_settings(msg["accounts"], msg["categories"], msg["methods"], msg.get("renames", {}))
    return None


async def _rec_save(m: FinanceTrackerManager, msg: dict, user: str):
    return await m.save_recurring(msg["item"])


async def _rec_delete(m: FinanceTrackerManager, msg: dict, user: str):
    await m.delete_recurring(msg["id_spesa"])
    return None


async def _rec_register(m: FinanceTrackerManager, msg: dict, user: str):
    return await m.register_recurring(msg["id_spesa"], msg.get("date"), msg.get("amount"), user)


async def _rec_skip(m: FinanceTrackerManager, msg: dict, user: str):
    return await m.skip_recurring(msg["id_spesa"])


async def _import(m: FinanceTrackerManager, msg: dict, user: str):
    return await m.import_data(msg["payload"], msg.get("mode", "replace"))


async def _export(m: FinanceTrackerManager, msg: dict, user: str):
    return m.export_data()


async def _prefs(m: FinanceTrackerManager, msg: dict, user: str):
    return await m.save_prefs(msg.get("notify_services"), msg.get("sensors"), msg.get("theme"),
                              msg["currency"] if "currency" in msg else False)


async def _targets(m: FinanceTrackerManager, msg: dict, user: str):
    services = m.hass.services.async_services().get("notify", {})
    skip = {"send_message", "persistent_notification", "notify"}
    return sorted(f"notify.{name}" for name in services if name not in skip)


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_subscribe)
    commands = [
        ("financetracker/movement/add", {vol.Required("movement"): ANY_DICT}, _add),
        ("financetracker/movement/update",
         {vol.Required("id_movimento"): str, vol.Required("movement"): ANY_DICT}, _update),
        ("financetracker/movement/delete", {vol.Required("id_movimento"): str}, _delete),
        ("financetracker/settings/save", {
            vol.Required("accounts"): [ANY_DICT],
            vol.Required("categories"): [str],
            vol.Required("methods"): [str],
            vol.Optional("renames"): ANY_DICT,
        }, _settings),
        ("financetracker/recurring/save", {vol.Required("item"): ANY_DICT}, _rec_save),
        ("financetracker/recurring/delete", {vol.Required("id_spesa"): str}, _rec_delete),
        ("financetracker/recurring/register", {
            vol.Required("id_spesa"): str,
            vol.Optional("date"): vol.Any(str, None),
            vol.Optional("amount"): vol.Any(vol.Coerce(float), None),
        }, _rec_register),
        ("financetracker/recurring/skip", {vol.Required("id_spesa"): str}, _rec_skip),
        ("financetracker/import", {
            vol.Required("payload"): ANY_DICT,
            vol.Optional("mode"): vol.In(["replace", "merge"]),
        }, _import),
        ("financetracker/export", {}, _export),
        ("financetracker/prefs/save", {
            vol.Optional("notify_services"): [str],
            vol.Optional("sensors"): bool,
            vol.Optional("theme"): vol.In(["auto", "light", "dark"]),
            vol.Optional("currency"): vol.Any(None, str),
        }, _prefs),
        ("financetracker/notify_targets", {}, _targets),
    ]
    for command, schema, func in commands:
        websocket_api.async_register_command(hass, _handler(command, schema, func))
