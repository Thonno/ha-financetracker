"""Finanze: gestione manuale delle finanze personali dentro Home Assistant."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import ServiceValidationError
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.typing import ConfigType

from . import websocket
from .const import (
    CONF_NOTIFY_TIME, DEFAULT_NOTIFY_TIME, DOMAIN, PANEL_COMPONENT, PANEL_URL, STATIC_URL, VERSION,
)
from .manager import FinanzeError, FinanzeManager, FinanzeRegistry
from .reminders import Reminders

PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

SERVICE_ADD = "aggiungi_movimento"
SERVICE_REGISTER = "registra_spesa_fissa"

ADD_SCHEMA = vol.Schema({
    vol.Required("importo"): vol.Coerce(float),
    vol.Optional("tipo", default="uscita"): vol.In(["uscita", "entrata", "trasferimento"]),
    vol.Optional("categoria", default=""): cv.string,
    vol.Optional("descrizione", default=""): cv.string,
    vol.Optional("conto", default=""): cv.string,
    vol.Optional("conto_destinazione", default=""): cv.string,
    vol.Optional("metodo", default=""): cv.string,
    vol.Optional("data"): cv.date,
    vol.Optional("note", default=""): cv.string,
    vol.Optional("utente"): cv.string,
})
REGISTER_SCHEMA = vol.Schema({
    vol.Required("spesa"): cv.string,
    vol.Optional("importo"): vol.Coerce(float),
    vol.Optional("data"): cv.date,
    vol.Optional("utente"): cv.string,
})


@dataclass
class FinanzeRuntime:
    registry: FinanzeRegistry
    reminders: Reminders


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    websocket.async_register(hass)

    async def _manager(call: ServiceCall) -> FinanzeManager:
        """L'archivio è quello dell'utente che esegue l'azione, o di `utente` se indicato."""
        registry: FinanzeRegistry | None = hass.data.get(DOMAIN)
        if registry is None:
            raise ServiceValidationError("Finanze non è configurata")
        try:
            if name := call.data.get("utente"):
                manager = await registry.get_by_name(name)
                caller = call.context.user_id
                if caller and caller != manager.user_id:
                    user = await hass.auth.async_get_user(caller)
                    if not (user and user.is_admin):
                        raise FinanzeError("Puoi scrivere solo nel tuo archivio")
                return manager
            if call.context.user_id:
                return await registry.get(call.context.user_id)
        except FinanzeError as err:
            raise ServiceValidationError(str(err)) from err
        raise ServiceValidationError(
            "Chiamata da un'automazione: indica in «utente» il nome dell'utente di Home Assistant")

    async def _user(call: ServiceCall) -> str:
        if call.context.user_id and (user := await hass.auth.async_get_user(call.context.user_id)):
            return user.name or ""
        return "Automazione"

    async def add_movement(call: ServiceCall) -> ServiceResponse:
        d = call.data
        try:
            m = await (await _manager(call)).add_movement({
                "amount": d["importo"], "type": d["tipo"], "category": d["categoria"],
                "description": d["descrizione"], "account": d["conto"],
                "to_account": d["conto_destinazione"], "method": d["metodo"],
                "date": d.get("data"), "note": d["note"],
            }, await _user(call))
        except FinanzeError as err:
            raise ServiceValidationError(str(err)) from err
        return {"movimento": m}

    async def register(call: ServiceCall) -> ServiceResponse:
        d = call.data
        try:
            m = await (await _manager(call)).register_recurring(
                d["spesa"], d["data"].isoformat() if d.get("data") else None,
                d.get("importo"), await _user(call))
        except FinanzeError as err:
            raise ServiceValidationError(str(err)) from err
        return {"movimento": m}

    hass.services.async_register(DOMAIN, SERVICE_ADD, add_movement, ADD_SCHEMA,
                                 supports_response=SupportsResponse.OPTIONAL)
    hass.services.async_register(DOMAIN, SERVICE_REGISTER, register, REGISTER_SCHEMA,
                                 supports_response=SupportsResponse.OPTIONAL)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    registry = FinanzeRegistry(hass)
    await registry.async_load()
    hass.data[DOMAIN] = registry

    if not hass.data.get(f"{DOMAIN}_static"):
        await hass.http.async_register_static_paths([
            StaticPathConfig(STATIC_URL, str(Path(__file__).parent / "frontend"), False)
        ])
        hass.data[f"{DOMAIN}_static"] = True

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL,
        webcomponent_name=PANEL_COMPONENT,
        sidebar_title="Finanze",
        sidebar_icon="mdi:wallet-outline",
        module_url=f"{STATIC_URL}/finanze-panel.js?v={VERSION}",
        require_admin=False,
        config={},
    )

    reminders = Reminders(hass, registry, entry.options.get(CONF_NOTIFY_TIME, DEFAULT_NOTIFY_TIME))
    reminders.start()
    entry.runtime_data = FinanzeRuntime(registry, reminders)
    entry.async_on_unload(entry.add_update_listener(_reload))

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        entry.runtime_data.reminders.stop()
        frontend.async_remove_panel(hass, PANEL_URL)
        hass.data.pop(DOMAIN, None)
    return unloaded
