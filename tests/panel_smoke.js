/* Smoke test del pannello: node tests/panel_smoke.js
 * DOM minimo simulato (HTMLElement, customElements); dati dimostrativi. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

class FakeEl {
  constructor() { this._html = ""; this.dataset = {}; this.attrs = {}; this.children = []; }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  querySelector() { return new FakeEl(); }
  querySelectorAll() { return []; }
  getElementById() { return new FakeEl(); }
  addEventListener() {}
  appendChild(c) { this.children.push(c); return c; }
  remove() {}
  focus() {}
  closest() { return null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  dispatchEvent() { return true; }
}
class HTMLElement extends FakeEl {
  attachShadow() { this.shadowRoot = new FakeEl(); return this.shadowRoot; }
}
const registry = new Map();
const ctx = {
  HTMLElement, console, Intl, Date, Math, Number, String, JSON, Map, Set, Promise, Error, URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  customElements: { get: (n) => registry.get(n), define: (n, c) => registry.set(n, c) },
  document: { createElement: () => new FakeEl() },
  window: { matchMedia: () => ({ matches: false }) },
  setTimeout: (f) => 0, Event: class { constructor(n) { this.type = n; } }, Blob: class {},
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "custom_components", "financetracker", "frontend", "financetracker-panel.js"), "utf8"), ctx);

const Panel = registry.get("financetracker-panel");
assert(Panel, "custom element registrato");

const sent = [];
const demo = {
  today: "2026-11-20", version: "test", user: "Demo", currency: "EUR", ha_currency: "EUR",
  accounts: [{ name: "Current account", initial_balance: 1000 }, { name: "Cash", initial_balance: 50 }],
  categories: ["Groceries", "Restaurants", "Leisure", "Salary"], methods: ["Card"],
  movements: [
    { id: "a", date: "2026-11-01", type: "entrata", amount: 2000, category: "Salary", account: "Current account" },
    { id: "b", date: "2026-11-03", type: "uscita", amount: 170, category: "Groceries", account: "Current account" },
    { id: "c", date: "2026-11-05", type: "uscita", amount: 130, category: "Restaurants", account: "Cash" },
    { id: "d", date: "2026-10-05", type: "uscita", amount: 999, category: "Restaurants", account: "Cash" },
  ],
  recurring: [], budgets: [{ category: "Groceries", amount: 200 }, { category: "Restaurants", amount: 100 }],
  settings: { theme: "auto", budget_alerts: true, notify_services: [] },
};

for (const lang of ["it", "en"]) {
  const p = new Panel();
  p.hass = {
    locale: { language: lang }, themes: { darkMode: false },
    connection: { subscribeMessage: (cb) => { cb(JSON.parse(JSON.stringify(demo))); return Promise.resolve(() => {}); } },
    callWS: (msg) => { sent.push(msg); return Promise.resolve(msg.type.endsWith("notify_targets") ? [] : null); },
  };
  p.connectedCallback();

  // Home: card budget con percentuali e sforamento
  const home = p._home();
  assert(home.includes(lang === "it" ? "Budget" : "Budget"), "card budget in Home");
  assert(home.includes("130%"), "Restaurants al 130%");
  assert(home.includes('class="over"') && home.includes('class="hi"'), "colori soglie");
  assert(home.includes('class="pace"'), "indicatore del mese in corso");
  if (lang === "en") assert(home.includes("Over by") && home.includes("left"), "testi inglesi");

  // Report: mese con budget, anno senza; mese passato senza indicatore
  for (const v of ["report", "impostazioni", "movimenti", "fisse"]) { p.view = v; p._renderMain(); }
  p.rep.month = "2026-10";
  const rep = p._report();
  assert(rep.includes("999") || rep.includes("Restaurants"), "report di ottobre");
  assert(!rep.includes('class="pace"'), "nessun indicatore nei mesi passati");
  p.rep.mode = "anno";
  assert(!p._report().includes("bud-edit"), "nessun budget nel report annuale");

  // Impostazioni
  assert(p._settings().includes("bud-edit"), "card budget in Impostazioni");

  // Foglio budget: modifica, validazione, salvataggio
  p._openBudgets();
  assert.strictEqual(p.sheet.draft.rows.length, 2);
  assert(p._budForm(p.sheet).includes("b-save"));
  p.sheet.draft.rows.push({ category: "Groceries", amount: "50" });
  ctx.__p = p;
  let failed = false;
  p._saveBudgets().catch(() => { failed = true; }).then(() => {});
  p.sheet.draft.rows.pop();
  p.sheet.draft.rows[0].amount = lang === "it" ? "250,50" : "250.50";
  p.sheet.draft.alerts = false;
  p._saveBudgets().then(() => {
    const save = sent.filter((m) => m.type === "financetracker/budgets/save").pop();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(save.budgets)), [{ category: "Groceries", amount: 250.5 }, { category: "Restaurants", amount: 100 }]);
    assert(sent.some((m) => m.type === "financetracker/prefs/save" && m.budget_alerts === false), "preferenza avvisi salvata");
    assert(failed, "categorie doppie rifiutate");
  }).catch((e) => { console.error(e); process.exitCode = 1; });

  // Senza budget: Home non mostra la card, Report invita a impostarli
  p.data.budgets = [];
  assert(!p._home().includes("bud-edit"));
  p.rep.mode = "mese";
  assert(p._report().includes("bud-edit"));
}
setImmediate(() => { if (!process.exitCode) console.log("panel smoke test: OK"); });
