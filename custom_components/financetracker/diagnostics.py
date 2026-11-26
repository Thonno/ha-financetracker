"""Diagnostica scaricabile da Impostazioni → Dispositivi e servizi → FinanceTracker.

Contiene solo conteggi e impostazioni tecniche: nessun nome, importo, descrizione
o identificativo degli utenti, perché il file viene spesso allegato alle issue pubbliche.
"""
from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import logic
from .const import VERSION
from .manager import FinanceTrackerManager


def _archive(manager: FinanceTrackerManager) -> dict[str, Any]:
    data = manager.data
    movements = data.get("movements", [])
    by_type = {t: sum(1 for m in movements if m.get("type") == t) for t in logic.TIPI}
    settings = data.get("settings", {})
    return {
        "accounts": len(data.get("accounts", [])),
        "accounts_with_interest": sum(1 for a in data.get("accounts", []) if (a.get("interest") or {}).get("enabled")),
        "categories": len(data.get("categories", [])),
        "methods": len(data.get("methods", [])),
        "movements": len(movements),
        "movements_by_type": by_type,
        "movements_automatic": sum(1 for m in movements if m.get("auto")),
        "first_month": movements[0]["date"][:7] if movements else None,
        "last_month": movements[-1]["date"][:7] if movements else None,
        "recurring": len(data.get("recurring", [])),
        "recurring_active": sum(1 for r in data.get("recurring", []) if logic.recurring_is_active(r)),
        "budgets": len(data.get("budgets", [])),
        "settings": {
            "notify_services": len(settings.get("notify_services", [])),
            "sensors": bool(settings.get("sensors")),
            "theme": settings.get("theme"),
            "currency": manager.currency,
            "budget_alerts": settings.get("budget_alerts", True),
        },
    }


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict[str, Any]:
    runtime = getattr(entry, "runtime_data", None)
    managers = list(runtime.registry.managers.values()) if runtime else []
    return {
        "version": VERSION,
        "options": dict(entry.options),
        "language": getattr(hass.config, "language", None),
        "ha_currency": getattr(hass.config, "currency", None),
        "archives": [{"archive": i + 1, **_archive(m)} for i, m in enumerate(managers)],
    }
