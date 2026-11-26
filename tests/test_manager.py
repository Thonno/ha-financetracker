"""Archivio di un utente: movimenti, impostazioni, budget, import/export."""
import pytest

from ft.manager import FinanceTrackerError


def add(run, m, amount, cat="Groceries", typ="uscita", d="2026-11-10"):
    return run(m.add_movement({"amount": amount, "category": cat, "type": typ, "date": d}, "Test"))


def test_new_archive_uses_ha_language(manager):
    assert manager.data["accounts"][0]["name"] == "Current account"
    assert manager.settings["budget_alerts"] is True
    assert manager.data["budgets"] == []


def test_add_movement_validates(manager, run):
    m = add(run, manager, "12,345")
    assert m["amount"] == 12.35 and m["account"] == "Current account"
    with pytest.raises(FinanceTrackerError):
        add(run, manager, 0)
    with pytest.raises(FinanceTrackerError):
        run(manager.add_movement({"amount": 5, "account": "Nope"}))


def test_save_budgets(manager, run):
    out = run(manager.save_budgets([{"category": "Groceries", "amount": "300"}, {"category": "Travel", "amount": 100}]))
    assert out == [{"category": "Groceries", "amount": 300.0}, {"category": "Travel", "amount": 100.0}]
    assert "Travel" in manager.data["categories"]
    with pytest.raises(FinanceTrackerError):
        run(manager.save_budgets([{"category": "A", "amount": 1}, {"category": "A", "amount": 2}]))
    with pytest.raises(FinanceTrackerError):
        run(manager.save_budgets([{"category": "A", "amount": 0}]))


def test_budget_alerts_flow(manager, run):
    run(manager.save_budgets([{"category": "Groceries", "amount": 100}]))
    add(run, manager, 50)
    assert run(manager.check_budget_alerts((80, 100))) == []
    add(run, manager, 35)
    due = run(manager.check_budget_alerts((80, 100)))
    assert [(s["category"], lv) for s, lv in due] == [("Groceries", 80)]
    assert run(manager.check_budget_alerts((80, 100))) == []
    # cambiare l'importo del budget riattiva le soglie
    run(manager.save_budgets([{"category": "Groceries", "amount": 80}]))
    assert [lv for _, lv in run(manager.check_budget_alerts((80, 100)))] == [100]


def test_rename_and_delete_category_updates_budgets(manager, run):
    run(manager.save_budgets([{"category": "Groceries", "amount": 100}, {"category": "Bills", "amount": 50}]))
    manager.data["budget_state"] = {"month": "2026-11", "levels": {"Groceries": 80}}
    cats = [c if c != "Groceries" else "Food" for c in manager.data["categories"] if c != "Bills"]
    run(manager.save_settings(manager.data["accounts"], cats, manager.data["methods"],
                              {"categories": {"Groceries": "Food"}}))
    assert manager.data["budgets"] == [{"category": "Food", "amount": 100.0}]
    assert manager.data["budget_state"]["levels"] == {"Food": 80}


def test_export_import_roundtrip(manager, run):
    add(run, manager, 10)
    run(manager.save_budgets([{"category": "Groceries", "amount": 100}]))
    manager.data["budget_state"] = {"month": "2026-11", "levels": {"Groceries": 80}}
    dump = manager.export_data()
    assert "settings" not in dump and "budget_state" not in dump and dump["budgets"]
    run(manager.import_data(dump, "replace"))
    assert manager.data["budgets"] == [{"category": "Groceries", "amount": 100.0}]
    assert manager.data["budget_state"] == {}
    run(manager.save_budgets([{"category": "Bills", "amount": 20}]))
    run(manager.import_data(dump, "merge"))
    assert {b["category"] for b in manager.data["budgets"]} == {"Bills", "Groceries"}
    assert len(manager.data["movements"]) == 2


def test_import_rejects_unknown_file(manager, run):
    with pytest.raises(FinanceTrackerError):
        run(manager.import_data({"format": "other"}))


def test_prefs(manager, run):
    run(manager.save_prefs(budget_alerts=False, currency="chf"))
    assert manager.settings["budget_alerts"] is False and manager.currency == "CHF"
    with pytest.raises(FinanceTrackerError):
        run(manager.save_prefs(currency="EURO"))


def test_interest_accrual(manager, run, clock):
    from datetime import date
    manager.data["accounts"][0]["initial_balance"] = 36500
    run(manager.set_interest("Current account", {"enabled": True, "tiers": [{"up_to": None, "rate": 1}],
                                                 "tax": 0, "start_date": "2026-11-17"}))
    interest = [m for m in manager.data["movements"] if m.get("auto") == "interest"]
    assert [m["date"] for m in interest] == ["2026-11-17", "2026-11-18", "2026-11-19"]
    assert interest[0]["amount"] == 1.0
