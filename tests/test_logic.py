"""Calcoli puri: saldi, totali, ricorrenze, interessi, budget."""
from datetime import date


def mov(d, typ, amount, cat="Groceries", acc="Current account", to=""):
    return {"date": d, "type": typ, "amount": amount, "category": cat, "account": acc, "to_account": to}


def test_add_months_clamps_to_month_end(lg):
    assert lg.add_months("2026-01-31", 1) == date(2026, 2, 28)
    assert lg.add_months("2026-11-15", 3) == date(2027, 2, 15)
    assert lg.add_months("2026-02-28", 1, day=31) == date(2026, 3, 31)


def test_balances_and_transfers(lg):
    data = {"accounts": [{"name": "A", "initial_balance": 100}, {"name": "B", "initial_balance": 0}],
            "movements": [mov("2026-11-01", "entrata", 50, acc="A"), mov("2026-11-02", "uscita", 20, acc="A"),
                          mov("2026-11-03", "trasferimento", 30, acc="A", to="B")]}
    assert lg.account_balances(data) == {"A": 100.0, "B": 30.0}
    assert lg.account_balances(data, until=date(2026, 11, 1)) == {"A": 150.0, "B": 0.0}


def test_period_totals_skip_transfers(lg):
    ms = [mov("2026-11-01", "entrata", 1000), mov("2026-11-05", "uscita", 250.5),
          mov("2026-11-06", "trasferimento", 99, to="B"), mov("2026-10-30", "uscita", 10)]
    t = lg.period_totals(ms, *lg.month_bounds(2026, 11))
    assert t == {"entrate": 1000.0, "uscite": 250.5, "netto": 749.5, "operazioni": 2}


def test_recurring_advance_and_end(lg):
    item = {"next_due": "2026-11-30", "cadence_months": 1, "day_of_month": 31, "end_date": "2026-12-31", "active": True}
    lg.advance_recurring(item)
    assert item["next_due"] == "2026-12-31" and item["active"]
    lg.advance_recurring(item)
    assert item["next_due"] == "2027-01-31" and not item["active"]


def test_recurring_due_and_monthly_total(lg):
    rec = [{"next_due": "2026-11-10", "amount": 120, "cadence_months": 12},
           {"next_due": "2026-12-10", "amount": 30, "cadence_months": 1},
           {"next_due": "2026-11-01", "amount": 5, "active": False}]
    assert [r["amount"] for r in lg.recurring_due(rec, date(2026, 11, 20))] == [120]
    assert lg.recurring_monthly_total(rec) == 40.0


def test_daily_interest_tiers(lg):
    tiers = [{"up_to": None, "rate": 1}, {"up_to": 3000, "rate": 2.5}]
    assert lg.daily_interest(0, tiers) == 0
    expected = (3000 * 0.025 + 1000 * 0.01) / 365
    assert abs(lg.daily_interest(4000, tiers) - expected) < 1e-9


def test_money_format(lg):
    assert lg.money(1234.5, "EUR", "it") == "1.234,50 €"
    assert lg.money(1234.5, "USD", "en") == "$1,234.50"
    assert lg.money(12, "CHF", "en") == "CHF 12.00"


def test_clean_budgets(lg):
    raw = [{"category": " Food ", "amount": "200,5"}, {"category": "", "amount": 10},
           {"category": "Fun", "amount": 0}, {"category": "Food", "amount": 300}]
    assert lg.clean_budgets(raw) == [{"category": "Food", "amount": 300.0}]


def test_budget_status_and_totals(lg):
    ms = [mov("2026-11-02", "uscita", 150, cat="Food"), mov("2026-11-03", "uscita", 30, cat="Fun"),
          mov("2026-10-31", "uscita", 500, cat="Food"), mov("2026-11-04", "entrata", 999, cat="Food")]
    st = lg.budget_status(ms, [{"category": "Food", "amount": 200}, {"category": "Car", "amount": 100}], 2026, 11)
    assert st[0] == {"category": "Food", "amount": 200.0, "spent": 150.0, "remaining": 50.0, "pct": 75.0}
    assert st[1]["spent"] == 0 and st[1]["remaining"] == 100
    assert lg.budget_totals(st) == {"amount": 300.0, "spent": 150.0, "remaining": 150.0, "pct": 50.0}


def test_budget_alerts_once_per_level_and_month(lg):
    state = {}
    s80 = [{"category": "Food", "pct": 85.0}]
    assert [lv for _, lv in lg.budget_alerts_due(s80, state, "2026-11")] == [80]
    assert lg.budget_alerts_due(s80, state, "2026-11") == []
    assert [lv for _, lv in lg.budget_alerts_due([{"category": "Food", "pct": 130.0}], state, "2026-11")] == [100]
    assert lg.budget_alerts_due([{"category": "Food", "pct": 50.0}], state, "2026-11") == []
    # mese nuovo: si riparte
    assert [lv for _, lv in lg.budget_alerts_due(s80, state, "2026-12")] == [80]
    assert state == {"month": "2026-12", "levels": {"Food": 80}}


def test_budget_jump_straight_to_100(lg):
    state = {}
    assert [lv for _, lv in lg.budget_alerts_due([{"category": "Food", "pct": 100.0}], state, "2026-11")] == [100]
