"""La diagnostica non deve contenere nomi, importi o descrizioni."""
import json
from types import SimpleNamespace

from ft.diagnostics import async_get_config_entry_diagnostics


def test_diagnostics_has_no_personal_data(manager, run):
    run(manager.add_movement({"amount": 123.45, "category": "Secret category", "description": "Secret shop"}))
    run(manager.save_budgets([{"category": "Secret category", "amount": 777}]))
    entry = SimpleNamespace(options={"notify_time": "09:00:00"},
                            runtime_data=SimpleNamespace(registry=SimpleNamespace(managers={"u": manager})))
    out = run(async_get_config_entry_diagnostics(manager.hass, entry))
    text = json.dumps(out)
    for secret in ("Secret", "123.45", "777", "Current account", "Test", "user1"):
        assert secret not in text
    assert out["archives"][0]["movements"] == 1 and out["archives"][0]["budgets"] == 1
