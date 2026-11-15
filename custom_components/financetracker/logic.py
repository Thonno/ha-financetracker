"""Calcoli puri (nessuna dipendenza da Home Assistant) per l'integrazione FinanceTracker."""
from __future__ import annotations

import calendar
from datetime import date
from typing import Any, Iterable

TIPO_ENTRATA = "entrata"
TIPO_USCITA = "uscita"
TIPO_TRASFERIMENTO = "trasferimento"
TIPI = (TIPO_USCITA, TIPO_ENTRATA, TIPO_TRASFERIMENTO)

CADENZE = {1: "Mensile", 2: "Bimestrale", 3: "Trimestrale", 6: "Semestrale", 12: "Annuale"}


def parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def add_months(value: str | date, months: int, day: int | None = None) -> date:
    """Aggiunge mesi mantenendo il giorno (o `day`), limitato all'ultimo giorno del mese."""
    d = parse_date(value)
    total = d.year * 12 + (d.month - 1) + months
    year, month = divmod(total, 12)
    month += 1
    want = day or d.day
    return date(year, month, min(want, calendar.monthrange(year, month)[1]))


def month_bounds(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def _in_period(m: dict, start: date | None, end: date | None) -> bool:
    d = parse_date(m["date"])
    return (start is None or d >= start) and (end is None or d <= end)


def account_balances(data: dict[str, Any], until: date | None = None) -> dict[str, float]:
    """Saldo di ogni conto: saldo iniziale + entrate - uscite +/- trasferimenti."""
    balances: dict[str, float] = {
        a["name"]: float(a.get("initial_balance") or 0) for a in data.get("accounts", [])
    }
    for m in data.get("movements", []):
        if until is not None and parse_date(m["date"]) > until:
            continue
        amount = float(m["amount"])
        acc = m.get("account") or ""
        balances.setdefault(acc, 0.0)
        if m["type"] == TIPO_ENTRATA:
            balances[acc] += amount
        elif m["type"] == TIPO_USCITA:
            balances[acc] -= amount
        elif m["type"] == TIPO_TRASFERIMENTO:
            balances[acc] -= amount
            dest = m.get("to_account") or ""
            balances.setdefault(dest, 0.0)
            balances[dest] += amount
    return {k: round(v, 2) for k, v in balances.items() if k}


def period_totals(
    movements: Iterable[dict], start: date | None = None, end: date | None = None
) -> dict[str, float | int]:
    """Entrate, uscite, netto e numero di operazioni (i trasferimenti sono esclusi)."""
    entrate = uscite = 0.0
    count = 0
    for m in movements:
        if not _in_period(m, start, end):
            continue
        if m["type"] == TIPO_ENTRATA:
            entrate += float(m["amount"])
            count += 1
        elif m["type"] == TIPO_USCITA:
            uscite += float(m["amount"])
            count += 1
    return {
        "entrate": round(entrate, 2),
        "uscite": round(uscite, 2),
        "netto": round(entrate - uscite, 2),
        "operazioni": count,
    }


def expenses_by_category(
    movements: Iterable[dict], start: date | None = None, end: date | None = None
) -> dict[str, float]:
    out: dict[str, float] = {}
    for m in movements:
        if m["type"] == TIPO_USCITA and _in_period(m, start, end):
            cat = m.get("category") or "Altro"
            out[cat] = round(out.get(cat, 0.0) + float(m["amount"]), 2)
    return dict(sorted(out.items(), key=lambda kv: kv[1], reverse=True))


def past_end(next_due: str | date | None, end: str | date | None) -> bool:
    """True se la scadenza cade in un mese successivo a quello di termine (ultima rata)."""
    if not next_due or not end:
        return False
    return parse_date(next_due).isoformat()[:7] > parse_date(end).isoformat()[:7]


def recurring_is_active(item: dict, today: date | None = None) -> bool:
    if not item.get("active", True):
        return False
    return not past_end(item.get("next_due"), item.get("end_date"))


def monthly_equivalent(item: dict) -> float:
    months = int(item.get("cadence_months") or 1)
    return float(item.get("amount") or 0) / months


def recurring_monthly_total(recurring: Iterable[dict]) -> float:
    return round(sum(monthly_equivalent(r) for r in recurring if recurring_is_active(r)), 2)


def recurring_due(recurring: Iterable[dict], today: date) -> list[dict]:
    """Spese fisse attive con scadenza oggi o già passata."""
    due = [
        r
        for r in recurring
        if recurring_is_active(r) and r.get("next_due") and parse_date(r["next_due"]) <= today
    ]
    return sorted(due, key=lambda r: r["next_due"])


def recurring_upcoming(recurring: Iterable[dict], today: date, days: int = 30) -> list[dict]:
    limit = date.fromordinal(today.toordinal() + days)
    items = [
        r
        for r in recurring
        if recurring_is_active(r) and r.get("next_due") and parse_date(r["next_due"]) <= limit
    ]
    return sorted(items, key=lambda r: r["next_due"])


def advance_recurring(item: dict) -> dict:
    """Sposta la prossima scadenza avanti di una cadenza; disattiva se oltre la data di termine."""
    months = int(item.get("cadence_months") or 1)
    day = item.get("day_of_month")
    nxt = add_months(item["next_due"], months, day)
    item["next_due"] = nxt.isoformat()
    if past_end(nxt, item.get("end_date")):
        item["active"] = False
    return item


def movement_from_recurring(item: dict, on: date) -> dict:
    return {
        "date": on.isoformat(),
        "type": TIPO_USCITA,
        "amount": round(float(item["amount"]), 2),
        "category": item.get("category") or "",
        "description": item.get("name") or "",
        "method": item.get("method") or "",
        "account": item.get("account") or "",
        "note": "",
        "recurring_id": item.get("id"),
    }


# ---------------------------------------------------------------- interessi
def clean_tiers(tiers: Iterable[dict]) -> list[dict]:
    """Scaglioni ordinati: [{"up_to": 3000, "rate": 2.5}, {"up_to": None, "rate": 1.0}]."""
    out = []
    for t in tiers or []:
        rate = float(t.get("rate") or 0)
        cap = t.get("up_to")
        cap = None if cap in (None, "", 0) else float(cap)
        out.append({"up_to": cap, "rate": rate})
    capped = sorted([t for t in out if t["up_to"] is not None], key=lambda t: t["up_to"])
    open_ended = [t for t in out if t["up_to"] is None][:1]
    return capped + open_ended


def daily_interest(balance: float, tiers: Iterable[dict], days_in_year: int = 365) -> float:
    """Interesse lordo di un giorno sul saldo, applicando ogni tasso alla sua fascia."""
    if balance <= 0:
        return 0.0
    total, prev, remaining = 0.0, 0.0, float(balance)
    for t in clean_tiers(tiers):
        portion = remaining if t["up_to"] is None else min(remaining, max(t["up_to"] - prev, 0))
        total += portion * t["rate"] / 100 / days_in_year
        remaining -= portion
        if t["up_to"] is not None:
            prev = t["up_to"]
        if remaining <= 0:
            break
    return total


SYMBOLS = {"EUR": "€", "USD": "$", "GBP": "£", "JPY": "¥", "CNY": "¥", "INR": "₹", "KRW": "₩",
           "BRL": "R$", "CAD": "CA$", "AUD": "A$", "NZD": "NZ$", "MXN": "MX$", "ILS": "₪", "TRY": "₺"}


def money(value: float, currency: str = "EUR", lang: str = "it") -> str:
    """Importo con la valuta, nel formato della lingua (12,50 € / €12.50 / 12,50 CHF)."""
    sym = SYMBOLS.get(currency, currency)
    if lang == "it":
        text = f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f"{text} {sym}"
    text = f"{value:,.2f}"
    return f"{sym}{text}" if len(sym) <= 2 or sym.endswith("$") else f"{sym} {text}"


def _services(manager: FinanceTrackerManager) -> list[str]:
    return [s.removeprefix("notify.") for s in manager.settings.get("notify_services", [])]
