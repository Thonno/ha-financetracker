"""Costanti dell'integrazione Finanze."""
from __future__ import annotations

DOMAIN = "finanze"
VERSION = "1.1.0"

STORAGE_KEY = "finanze.utente_{}"
INDEX_KEY = "finanze.utenti"
STORAGE_VERSION = 1

PANEL_URL = "finanze"
PANEL_COMPONENT = "finanze-panel"
STATIC_URL = "/finanze_static"

SIGNAL_UPDATED = "finanze_updated_{}"
SIGNAL_ANY = "finanze_updated"

CONF_NOTIFY_TIME = "notify_time"
DEFAULT_NOTIFY_TIME = "09:00:00"

ACTION_REGISTER = "FINANZE_REG_"
ACTION_SKIP = "FINANZE_SKIP_"

DEFAULT_DATA = {
    "accounts": [
        {"name": "Conto corrente", "initial_balance": 0},
        {"name": "Contanti", "initial_balance": 0},
    ],
    "categories": ["Spesa", "Casa", "Bollette", "Abbonamenti", "Ristorante", "Svago", "Stipendio", "Altro"],
    "methods": ["Bancomat", "Carta", "Bonifico", "Addebito diretto", "Contanti"],
    "movements": [],
    "recurring": [],
    "settings": {"notify_services": [], "sensors": False},
}
