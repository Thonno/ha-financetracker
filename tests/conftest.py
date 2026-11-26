"""Ambiente di test senza Home Assistant installato.

I moduli dell'integrazione vengono caricati come pacchetto `ft` (senza eseguire
`__init__.py`), con stub minimi delle parti di Home Assistant che usano.
"""
from __future__ import annotations

import asyncio
import sys
import types
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1] / "custom_components" / "financetracker"


def _module(name: str, **attrs) -> types.ModuleType:
    mod = sys.modules.get(name) or types.ModuleType(name)
    for key, value in attrs.items():
        setattr(mod, key, value)
    sys.modules[name] = mod
    return mod


class HomeAssistantError(Exception):
    pass


class FakeStore:
    saved: dict = {}

    def __init__(self, hass, version, key):
        self.key = key

    async def async_load(self):
        return FakeStore.saved.get(self.key)

    async def async_save(self, data):
        FakeStore.saved[self.key] = data


class Clock:
    today = date(2026, 11, 20)


def _now():
    d = Clock.today
    return datetime(d.year, d.month, d.day, 12, tzinfo=timezone.utc)


_module("homeassistant")
_module("homeassistant.core", HomeAssistant=object, callback=lambda f: f)
_module("homeassistant.exceptions", HomeAssistantError=HomeAssistantError)
_module("homeassistant.config_entries", ConfigEntry=object)
_module("homeassistant.helpers")
_module("homeassistant.helpers.dispatcher", async_dispatcher_send=lambda *a, **k: None)
_module("homeassistant.helpers.storage", Store=FakeStore)
_module("homeassistant.util")
_module("homeassistant.util.dt", now=_now, utcnow=_now)

_module("ft", __path__=[str(ROOT)])

from ft import logic  # noqa: E402
from ft.manager import FinanceTrackerManager  # noqa: E402


class FakeConfig:
    language = "en"
    currency = "EUR"


class FakeHass:
    config = FakeConfig()

    def async_create_task(self, coro):
        return asyncio.get_event_loop().create_task(coro)


@pytest.fixture
def run():
    return lambda coro: asyncio.run(coro)


@pytest.fixture
def clock():
    Clock.today = date(2026, 11, 20)
    return Clock


@pytest.fixture
def manager(clock, run):
    FakeStore.saved = {}
    m = FinanceTrackerManager(FakeHass(), "user1", "Test")
    run(m.async_load())
    return m


@pytest.fixture
def lg():
    return logic
