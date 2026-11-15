"""Converte il file Excel "Gestione Finanze Personali" nel file JSON da importare nel pannello Finanze.

Uso:
    python3 excel_to_finanze.py FILE.xlsx finanze_import.json [--principale CONTO --deposito CONTO]

Regole di conversione:
- "Uscita" con categoria "Prelievo" da un conto bancario       -> trasferimento verso "Contanti"
- con --principale/--deposito:
  "Uscita" con categoria "Conto deposito" dal conto principale  -> trasferimento verso il conto deposito
  "Entrata" con categoria "Conto deposito" sul conto principale -> trasferimento dal conto deposito
- la riga "Saldo iniziale" viene ignorata: i saldi iniziali arrivano dalla scheda Liste.
"""
from __future__ import annotations

import json
import sys
import uuid
from collections import Counter
from datetime import date, datetime

import openpyxl

sys.path.insert(0, __file__.rsplit("/tools/", 1)[0] + "/custom_components/finanze")
from logic import add_months, past_end  # noqa: E402

CADENZE = {"mensile": 1, "bimestrale": 2, "trimestrale": 3, "semestrale": 6, "annuale": 12}


def _d(v) -> str | None:
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return None


def _col(ws, col: int, start: int = 2) -> list:
    out = []
    for (v,) in ws.iter_rows(min_row=start, min_col=col, max_col=col, values_only=True):
        if v is not None and str(v).strip():
            out.append(str(v).strip())
    return out


def convert(path: str, today: date | None = None, principale: str | None = None,
            deposito: str | None = None) -> dict:
    today = today or date.today()
    wb = openpyxl.load_workbook(path, data_only=False)
    liste = wb["Liste"]

    categories = [c for c in _col(liste, 1) if c != "Saldo iniziale"]
    methods = _col(liste, 2)
    account_names = _col(liste, 4)
    initial = {}
    for name, val in liste.iter_rows(min_row=3, min_col=6, max_col=7, values_only=True):
        if name in account_names and isinstance(val, (int, float)):
            initial[name] = float(val)
    accounts = [{"name": n, "initial_balance": round(initial.get(n, 0.0), 2)} for n in account_names]

    method_lookup = {m.lower(): m for m in methods}
    movements: list[dict] = []
    for row in wb["Movimenti"].iter_rows(min_row=2, max_col=9, values_only=True):
        d, tipo, cat, desc, meth, acc, amount, _saldo, note = row
        if not _d(d) or tipo not in ("Entrata", "Uscita") or not isinstance(amount, (int, float)):
            continue
        m = {
            "id": uuid.uuid4().hex[:12],
            "date": _d(d),
            "type": tipo.lower(),
            "amount": round(float(amount), 2),
            "category": (cat or "Altro").strip(),
            "description": (str(desc).strip() if desc else ""),
            "method": method_lookup.get(str(meth or "").lower(), str(meth or "")),
            "account": acc or (account_names[0] if account_names else ""),
            "to_account": "",
            "note": (str(note).strip() if note else ""),
            "created_by": "Import Excel",
        }
        if m["category"] == "Prelievo" and m["type"] == "uscita" and m["account"] != "Contanti":
            m["type"], m["to_account"] = "trasferimento", "Contanti"
        elif principale and deposito and m["category"] == "Conto deposito" and m["account"] == principale:
            if m["type"] == "uscita":
                m["type"], m["to_account"] = "trasferimento", deposito
            else:
                m["type"], m["account"], m["to_account"] = "trasferimento", deposito, principale
        movements.append(m)
    movements.sort(key=lambda m: m["date"])

    recurring: list[dict] = []
    ws = wb["Spese fisse"]
    for row in ws.iter_rows(min_row=2, max_col=7, values_only=True):
        name, amount, cat, cad, meth, end, stato = row
        if not name or not isinstance(amount, (int, float)):
            continue
        months = CADENZE.get(str(cad or "mensile").strip().lower(), 1)
        key = str(name).lower()
        first = key.split()[0]
        same_amount = [m for m in movements
                       if m["type"] == "uscita" and abs(m["amount"] - float(amount)) < 0.01]
        matches = [m for m in same_amount
                   if first in m["description"].lower() or key == m["category"].lower()]
        if not matches:  # stesso importo e stessa categoria
            matches = [m for m in same_amount if m["category"] == cat]
        account = Counter(m["account"] for m in matches).most_common(1)
        account = account[0][0] if account else (account_names[0] if account_names else "")
        if matches:
            last = matches[-1]["date"]
            day = Counter(int(m["date"][8:10]) for m in matches).most_common(1)[0][0]
            nxt = add_months(last, months, day)
            verify = False
        else:
            day = 1
            nxt = add_months(today.replace(day=1), 1)
            verify = True
        active = str(stato or "").strip().lower() != "terminato"
        end_iso = _d(end)
        if past_end(nxt, end_iso):
            active = False
        recurring.append({
            "id": uuid.uuid4().hex[:12],
            "name": str(name).strip(),
            "amount": round(float(amount), 2),
            "category": cat or "",
            "cadence_months": months,
            "method": method_lookup.get(str(meth or "").lower(), str(meth or "")),
            "account": account,
            "day_of_month": day,
            "next_due": nxt.isoformat(),
            "end_date": end_iso,
            "active": active,
            "to_verify": verify,
        })

    for m in movements:  # categorie usate ma non in elenco
        if m["category"] and m["category"] not in categories:
            categories.append(m["category"])
    return {
        "format": "finanze",
        "version": 1,
        "accounts": accounts,
        "categories": categories,
        "methods": methods,
        "movements": movements,
        "recurring": recurring,
    }


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx")
    ap.add_argument("output")
    ap.add_argument("--principale", help="conto principale (es. il conto corrente)")
    ap.add_argument("--deposito", help="conto deposito / risparmio")
    a = ap.parse_args()
    data = convert(a.xlsx, principale=a.principale, deposito=a.deposito)
    with open(a.output, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    print(f"{len(data['movements'])} movimenti, {len(data['recurring'])} spese fisse -> {a.output}")
