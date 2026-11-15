"""Costanti dell'integrazione FinanceTracker."""
from __future__ import annotations

DOMAIN = "financetracker"
VERSION = "2.2.0"

STORAGE_KEY = "financetracker.user_{}"
INDEX_KEY = "financetracker.users"
STORAGE_VERSION = 1

PANEL_URL = "financetracker"
PANEL_COMPONENT = "financetracker-panel"
STATIC_URL = "/financetracker_static"

SIGNAL_UPDATED = "financetracker_updated_{}"
SIGNAL_ANY = "financetracker_updated"

CONF_NOTIFY_TIME = "notify_time"
DEFAULT_NOTIFY_TIME = "09:00:00"

ACTION_REGISTER = "FINANCETRACKER_REG_"
ACTION_SKIP = "FINANCETRACKER_SKIP_"

DEFAULT_DATA = {
    "accounts": [
        {"name": "Conto corrente", "initial_balance": 0},
        {"name": "Contanti", "initial_balance": 0},
    ],
    "categories": ["Spesa", "Casa", "Bollette", "Abbonamenti", "Ristorante", "Svago", "Stipendio", "Altro"],
    "methods": ["Bancomat", "Carta", "Bonifico", "Addebito diretto", "Contanti"],
    "movements": [],
    "recurring": [],
    "settings": {"notify_services": [], "sensors": False, "theme": "auto", "currency": None},
}
