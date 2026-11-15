"""Testi lato server nella lingua configurata in Home Assistant (italiano o inglese)."""
from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

SUPPORTED = ("it", "en")

MESSAGES: dict[str, dict[str, str]] = {
    "not_found": {"it": "Elemento non trovato: {ref}", "en": "Item not found: {ref}"},
    "recurring_not_found": {"it": "Spesa fissa non trovata: {ref}", "en": "Recurring expense not found: {ref}"},
    "bad_type": {"it": "Tipo non valido: {type}", "en": "Invalid type: {type}"},
    "bad_amount": {"it": "Importo non valido", "en": "Invalid amount"},
    "amount_positive": {"it": "L'importo deve essere maggiore di zero", "en": "The amount must be greater than zero"},
    "unknown_account": {"it": "Conto sconosciuto: {account}", "en": "Unknown account: {account}"},
    "transfer_accounts": {
        "it": "Per un trasferimento scegli un conto di destinazione diverso",
        "en": "For a transfer, pick a different destination account",
    },
    "account_names": {
        "it": "I nomi dei conti devono essere diversi e non vuoti",
        "en": "Account names must be unique and not empty",
    },
    "recurring_name": {"it": "Dai un nome alla spesa fissa", "en": "Give the recurring expense a name"},
    "bad_file": {"it": "File non riconosciuto: serve un export di FinanceTracker", "en": "Unrecognised file: a FinanceTracker export is required"},
    "unknown_user": {"it": "Utente sconosciuto", "en": "Unknown user"},
    "invalid_user": {"it": "Utente non valido", "en": "Invalid user"},
    "no_such_user": {
        "it": "Nessun utente di Home Assistant si chiama «{name}»",
        "en": "No Home Assistant user is called “{name}”",
    },
    "not_configured": {"it": "FinanceTracker non è configurato", "en": "FinanceTracker is not set up"},
    "own_archive_only": {"it": "Puoi scrivere solo nel tuo archivio", "en": "You can only write to your own archive"},
    "need_user": {
        "it": "Chiamata da un'automazione: indica in «user» il nome dell'utente di Home Assistant",
        "en": "Called from an automation: set “user” to the Home Assistant user name",
    },
    "notify_title": {"it": "Spesa fissa in scadenza", "en": "Recurring expense due"},
    "notify_register": {"it": "Registra", "en": "Register"},
    "notify_skip": {"it": "Salta", "en": "Skip"},
    "automation": {"it": "Automazione", "en": "Automation"},
    "bad_currency": {"it": "Valuta non valida: {code} (usa un codice ISO di 3 lettere, es. EUR)",
                     "en": "Invalid currency: {code} (use a 3-letter ISO code, e.g. EUR)"},
}

# Liste iniziali per un nuovo archivio
DEFAULTS: dict[str, dict[str, Any]] = {
    "it": {
        "accounts": [{"name": "Conto corrente", "initial_balance": 0}, {"name": "Contanti", "initial_balance": 0}],
        "categories": ["Spesa", "Casa", "Bollette", "Abbonamenti", "Ristorante", "Svago", "Stipendio", "Altro"],
        "methods": ["Bancomat", "Carta", "Bonifico", "Addebito diretto", "Contanti"],
    },
    "en": {
        "accounts": [{"name": "Current account", "initial_balance": 0}, {"name": "Cash", "initial_balance": 0}],
        "categories": ["Groceries", "Home", "Bills", "Subscriptions", "Restaurants", "Leisure", "Salary", "Other"],
        "methods": ["Debit card", "Credit card", "Bank transfer", "Direct debit", "Cash"],
    },
}

# Nomi degli attributi dei sensori
ATTRS: dict[str, dict[str, str]] = {
    "accounts": {"it": "conti", "en": "accounts"},
    "by_category": {"it": "per_categoria", "en": "by_category"},
    "items": {"it": "voci", "en": "items"},
    "name": {"it": "nome", "en": "name"},
    "amount": {"it": "importo", "en": "amount"},
    "due": {"it": "scadenza", "en": "due"},
}


def language(hass: HomeAssistant) -> str:
    lang = (getattr(hass.config, "language", None) or "en").split("-")[0].lower()
    return lang if lang in SUPPORTED else "en"


def tr(hass: HomeAssistant, key: str, **kwargs: Any) -> str:
    text = MESSAGES[key][language(hass)]
    return text.format(**kwargs) if kwargs else text


def attr(hass: HomeAssistant, key: str) -> str:
    return ATTRS[key][language(hass)]


def defaults(hass: HomeAssistant) -> dict[str, Any]:
    return DEFAULTS[language(hass)]
