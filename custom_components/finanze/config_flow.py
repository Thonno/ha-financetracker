"""Configurazione da interfaccia: un'unica istanza, opzioni per le notifiche."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.selector import TimeSelector

from .const import CONF_NOTIFY_TIME, DEFAULT_NOTIFY_TIME, DOMAIN


def _schema(hass: HomeAssistant, current: dict[str, Any]) -> vol.Schema:
    return vol.Schema({
        vol.Optional(CONF_NOTIFY_TIME, default=current.get(CONF_NOTIFY_TIME, DEFAULT_NOTIFY_TIME)):
            TimeSelector(),
    })


class FinanzeConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Finanze", data={}, options=user_input)
        return self.async_show_form(step_id="user", data_schema=_schema(self.hass, {}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return FinanzeOptionsFlow()


class FinanzeOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        return self.async_show_form(
            step_id="init", data_schema=_schema(self.hass, dict(self.config_entry.options)))
