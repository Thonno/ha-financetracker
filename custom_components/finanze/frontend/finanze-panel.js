/* Finanze – pannello per Home Assistant (nessuna dipendenza esterna). */

const EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const EUR0 = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto",
  "Settembre", "Ottobre", "Novembre", "Dicembre"];
const MONTHS_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const DAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const CADENZE = { 1: "Mensile", 2: "Bimestrale", 3: "Trimestrale", 6: "Semestrale", 12: "Annuale" };
const TIPI = { uscita: "Uscita", entrata: "Entrata", trasferimento: "Trasferimento" };
const VIEWS = [
  ["home", "Home", "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"],
  ["movimenti", "Movimenti", "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"],
  ["report", "Report", "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"],
  ["fisse", "Spese fisse", "M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"],
  ["impostazioni", "Impostazioni", "M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54a7.3 7.3 0 0 0-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.24.25.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"],
];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (v) => EUR.format(Number(v) || 0);
const eur0 = (v) => EUR0.format(Number(v) || 0);
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const ym = (s) => String(s).slice(0, 7);
const ymLabel = (k) => { const [y, m] = k.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
const shiftYm = (k, n) => { const [y, m] = k.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const dShort = (s) => { const d = parseD(s); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; };
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };

/* ----------------------------------------------------------------- calcoli */
function balances(data) {
  const b = {};
  for (const a of data.accounts) b[a.name] = Number(a.initial_balance) || 0;
  for (const m of data.movements) {
    const v = Number(m.amount);
    b[m.account] = b[m.account] ?? 0;
    if (m.type === "entrata") b[m.account] += v;
    else if (m.type === "uscita") b[m.account] -= v;
    else { b[m.account] -= v; b[m.to_account] = (b[m.to_account] ?? 0) + v; }
  }
  return b;
}
function totals(list) {
  let entrate = 0, uscite = 0, n = 0;
  for (const m of list) {
    if (m.type === "entrata") { entrate += +m.amount; n++; }
    else if (m.type === "uscita") { uscite += +m.amount; n++; }
  }
  return { entrate, uscite, netto: entrate - uscite, n };
}
function groupSum(list, key) {
  const out = new Map();
  for (const m of list) {
    if (m.type !== "uscita") continue;
    const k = m[key] || "—";
    const cur = out.get(k) || { name: k, total: 0, n: 0 };
    cur.total += +m.amount; cur.n++;
    out.set(k, cur);
  }
  return [...out.values()].sort((a, b) => b.total - a.total);
}
const pastEnd = (due, end) => !!(due && end && String(due).slice(0, 7) > String(end).slice(0, 7));
const recActive = (r) => r.active !== false && !pastEnd(r.next_due, r.end_date);

/* -------------------------------------------------------------------- stile */
const STYLE = `
:host{display:block;height:100%;color:#fff;-webkit-tap-highlight-color:transparent;
  font-family:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,Roboto,system-ui,sans-serif));
  --acc:#f6a23a;--acc2:#ea863c;--accbg:linear-gradient(145deg,rgba(246,162,58,.14),rgba(246,162,58,.04));--accbd:1.5px solid rgba(246,162,58,.65);
  --panel:rgb(23,27,36);--sheet:#171b24;--tile:rgba(255,255,255,.04);--bd:1px solid rgba(255,255,255,.07);--line:rgba(255,255,255,.07);
  --t2:rgba(255,255,255,.55);--t3:rgba(255,255,255,.45);--in:#4cd08a;--out:#ff7a6b;--fz-r:26px;color-scheme:dark}
*{box-sizing:border-box}
ha-icon{--mdc-icon-size:20px;display:inline-flex}
.app{display:flex;flex-direction:column;height:100%;position:relative;
  background:radial-gradient(1400px 1000px at 0% 15%,rgba(112,76,36,.36),transparent 62%),radial-gradient(1500px 900px at 100% 100%,rgba(28,50,110,.34),transparent 65%),#0c0f15}
header{display:flex;align-items:center;gap:6px;padding:calc(env(safe-area-inset-top) + 8px) 12px 4px;flex:none}
header .tt{flex:1;min-width:0}
header h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.2px}
header .who{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--t2);margin-top:2px}
.ib{background:rgba(255,255,255,.06);border:var(--bd);color:rgba(255,255,255,.88);width:42px;height:42px;border-radius:50%;display:grid;place-items:center;cursor:pointer;padding:0;flex:none}
.ib[disabled]{opacity:.3}
.ib svg{width:22px;height:22px;fill:currentColor}
main{flex:1;overflow-y:auto;padding:8px 12px 120px;-webkit-overflow-scrolling:touch}
.wrap{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
nav{position:absolute;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));display:flex;gap:2px;padding:5px;z-index:3;
  background:rgb(22,26,35);border:var(--bd);border-radius:24px;box-shadow:0 10px 26px rgba(0,0,0,.45);max-width:640px;margin:0 auto}
nav button{flex:1;background:none;border:0;color:rgba(255,255,255,.62);padding:7px 0 6px;font:inherit;font-size:10.5px;font-weight:700;
  display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;border-radius:18px;min-width:0}
nav button svg{width:22px;height:22px;fill:currentColor}
nav button.on{background:linear-gradient(90deg,var(--acc),var(--acc2));color:#2b1904;box-shadow:0 6px 18px rgba(246,162,58,.32)}
.card{background:var(--panel);border:var(--bd);border-radius:var(--fz-r);box-shadow:0 14px 34px rgba(0,0,0,.30);padding:14px 16px}
.ph{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.ph>ha-icon{color:var(--acc);--mdc-icon-size:24px}
.pt{flex:1;min-width:0;display:flex;flex-direction:column}
.pt b{font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt span{font-size:12px;color:var(--t2);margin-top:1px}
.pill{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:99px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);
  color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.pill ha-icon{--mdc-icon-size:16px}
.pill.on{background:var(--accbg);border:var(--accbd);color:var(--acc)}
.hero{position:relative;overflow:hidden}
.hero .lbl{letter-spacing:.2em}
.big{font-size:44px;font-weight:200;line-height:1.05;letter-spacing:-.5px;margin-top:4px}
.lbl{font-size:11px;color:var(--t2);text-transform:uppercase;letter-spacing:.14em;font-weight:700}
.row{display:flex;align-items:center;gap:12px}
.grow{flex:1;min-width:0}
.sec{color:var(--t2);font-size:13px}
.ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.in{color:var(--in)} .out{color:var(--out)} .tr{color:var(--t2)}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-top:12px}
.tile{background:var(--tile);border:var(--bd);border-radius:16px;padding:9px 12px;min-width:0}
.tile.on{background:var(--accbg);border:var(--accbd)}
.tile .l{font-size:12px;color:var(--t2);display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .l ha-icon{color:var(--acc);--mdc-icon-size:16px}
.tile .v{font-size:17px;font-weight:700;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile .s{font-size:11px;color:var(--t3);margin-top:1px}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.kpi .tile{padding:9px 10px} .kpi .tile .v{font-size:15px}
.bar{height:6px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:6px}
.bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--acc),var(--acc2))}
.list{display:flex;flex-direction:column}
.item{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer}
.item:last-child{border-bottom:0}
.ico{width:40px;height:40px;border-radius:14px;flex:none;display:grid;place-items:center;font-weight:700;font-size:15px}
.ico ha-icon{--mdc-icon-size:21px}
.amt{font-weight:700;white-space:nowrap;text-align:right}
.day{display:flex;justify-content:space-between;font-size:11px;color:var(--t2);padding:14px 2px 2px;font-weight:700;text-transform:uppercase;letter-spacing:.14em}
.btn{border:0;border-radius:16px;padding:12px 18px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;
  background:linear-gradient(90deg,var(--acc),var(--acc2));color:#2b1904;box-shadow:0 6px 18px rgba(246,162,58,.25)}
.btn.flat{background:var(--tile);border:var(--bd);color:rgba(255,255,255,.88);box-shadow:none}
.btn.warn{background:linear-gradient(90deg,#ff7a6b,#e8584a);color:#2b0904}
.btn.danger{color:var(--out)}
.btn.sm{padding:8px 14px;font-size:13px;border-radius:12px}
.btn[disabled]{opacity:.5}
.fab{position:absolute;right:18px;bottom:calc(92px + env(safe-area-inset-bottom));width:60px;height:60px;border-radius:20px;border:0;
  background:linear-gradient(135deg,var(--acc),var(--acc2));color:#2b1904;box-shadow:0 10px 26px rgba(246,162,58,.38);display:grid;place-items:center;cursor:pointer;z-index:2}
.fab svg{width:30px;height:30px;fill:currentColor}
.seg{display:flex;background:rgba(255,255,255,.04);border:var(--bd);border-radius:16px;padding:4px;gap:4px}
.seg button{flex:1;border:0;background:none;color:rgba(255,255,255,.62);font:inherit;font-size:14px;font-weight:700;padding:9px 4px;border-radius:12px;cursor:pointer}
.seg button.on{background:linear-gradient(90deg,var(--acc),var(--acc2));color:#2b1904}
.mbar{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mbar b{font-weight:700;font-size:16px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{border:var(--bd);background:var(--tile);color:rgba(255,255,255,.88);border-radius:99px;padding:8px 13px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.chip.on{background:var(--accbg);border:var(--accbd);color:var(--acc)}
.chip.danger{color:var(--out)}
input,select,textarea{font:inherit;font-size:16px;color:#fff;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);
  border-radius:14px;padding:11px 13px;width:100%;outline:none;-webkit-appearance:none;appearance:none}
input::placeholder{color:rgba(255,255,255,.35)}
select{background-image:linear-gradient(45deg,transparent 50%,rgba(255,255,255,.6) 50%),linear-gradient(135deg,rgba(255,255,255,.6) 50%,transparent 50%);
  background-position:calc(100% - 18px) 50%,calc(100% - 13px) 50%;background-size:5px 5px;background-repeat:no-repeat;padding-right:30px}
option{background:#171b24}
input:focus,select:focus{border-color:rgba(246,162,58,.65)}
label.f{display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--t2);text-transform:uppercase;letter-spacing:.14em;font-weight:700}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.amount{font-size:46px;font-weight:200;text-align:center;background:none;border:0;border-bottom:1px solid rgba(255,255,255,.12);border-radius:0;padding:4px 0}
.amount:focus{border-color:var(--acc)}
.scrim{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:10;display:flex;align-items:flex-end;justify-content:center;animation:fade .15s}
.sheet{background:var(--sheet);border:1px solid rgba(255,255,255,.10);width:100%;max-width:640px;max-height:92%;border-radius:26px 26px 0 0;
  display:flex;flex-direction:column;animation:up .2s ease-out;box-shadow:0 24px 60px rgba(0,0,0,.6)}
.sheet .hd{display:flex;align-items:center;gap:12px;padding:16px 16px 4px}
.sheet .hd .ico{background:rgba(246,162,58,.15);color:var(--acc)}
.sheet .hd h3{flex:1;margin:0;font-size:18px;font-weight:700}
.sheet .bd{overflow-y:auto;padding:10px 16px 16px;display:flex;flex-direction:column;gap:14px}
.sheet .ft{display:flex;gap:8px;padding:10px 16px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--line)}
.sheet .ft .btn:last-child{flex:1}
@media(min-width:700px){.scrim{align-items:center}.sheet{border-radius:26px;max-height:86%}}
@keyframes up{from{transform:translateY(40px);opacity:.4}} @keyframes fade{from{opacity:0}}
.toast{position:fixed;left:50%;bottom:calc(100px + env(safe-area-inset-bottom));transform:translateX(-50%);background:rgba(12,15,21,.92);color:#fff;
  border:1.5px solid rgba(246,162,58,.65);padding:10px 18px;border-radius:99px;font-size:14px;font-weight:600;z-index:20;box-shadow:0 10px 26px rgba(0,0,0,.5);animation:fade .2s;max-width:90%}
.badge{display:inline-block;font-size:10px;border-radius:99px;padding:2px 8px;background:rgba(246,162,58,.15);color:var(--acc);font-weight:700;vertical-align:middle;
  border:1px solid rgba(246,162,58,.5);text-transform:uppercase;letter-spacing:.08em}
.due{background:linear-gradient(145deg,rgba(246,162,58,.10),rgba(23,27,36,1) 60%);border:var(--accbd)}
.duerow{background:var(--tile);border:var(--bd);border-radius:16px;padding:10px 12px;margin-top:8px}
.empty{text-align:center;color:var(--t2);padding:24px 8px}
.sugg{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.sugg::-webkit-scrollbar{display:none}
.chart svg{width:100%;height:auto;display:block}
.chart text{fill:var(--t2);font-size:10px}
.legend{display:flex;gap:14px;font-size:12px;color:var(--t2);margin-top:6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{padding:7px 4px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
td:first-child,th:first-child{text-align:left}
th{font-weight:700;color:var(--t2);font-size:11px;text-transform:uppercase;letter-spacing:.1em}
.ed{display:grid;grid-template-columns:1fr 110px 42px;gap:6px;align-items:center;margin-bottom:6px}
.ed.two{grid-template-columns:1fr 42px}
.ed input{padding:9px 11px}
.danger{color:var(--out)}
.loading{display:grid;place-items:center;height:60vh;color:var(--t2)}
.sw{position:relative;width:46px;height:28px;flex:none;border-radius:99px;background:rgba(255,255,255,.12);border:0;cursor:pointer;transition:.15s}
.sw::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:.15s}
.sw.on{background:linear-gradient(90deg,var(--acc),var(--acc2))} .sw.on::after{left:21px}
code{background:rgba(255,255,255,.08);padding:1px 5px;border-radius:6px;font-size:12px}
`;

const ICON = {
  menu: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  left: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
  right: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  del: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  swap: "M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z",
};
const svg = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const hd = (icon, title, label = "", right = "") =>
  `<div class="ph"><ha-icon icon="${icon}"></ha-icon><div class="pt"><b>${title}</b>${label ? `<span>${label}</span>` : ""}</div>${right}</div>`;
const CAT_ICON = {
  spesa: "mdi:cart-outline", mutuo: "mdi:home-city-outline", casa: "mdi:sofa-outline", bollette: "mdi:flash-outline",
  abbonamenti: "mdi:television-play", ristorante: "mdi:silverware-fork-knife", asporto: "mdi:moped-outline", gatto: "mdi:cat",
  svago: "mdi:party-popper", stipendio: "mdi:cash-plus", finanziamento: "mdi:credit-card-clock-outline", benzina: "mdi:gas-station-outline",
  farmacia: "mdi:pill", amazon: "mdi:package-variant-closed", "ricarica telefonica": "mdi:cellphone", svapo: "mdi:smoke",
  "conto deposito": "mdi:piggy-bank-outline", prelievo: "mdi:cash", "subito.it": "mdi:tag-outline",
  acquisiti: "mdi:shopping-outline", altro: "mdi:dots-horizontal-circle-outline", trasferimento: "mdi:swap-horizontal",
};
const catIcon = (c) => CAT_ICON[String(c || "").toLowerCase()] || "mdi:tag-outline";
const tint = (c) => { const h = hue(c); return `background:hsla(${h},70%,60%,.14);color:hsl(${h},75%,68%)`; };
const tile = (label, value, cls = "", sub = "", icon = "") =>
  `<div class="tile"><div class="l">${icon ? `<ha-icon icon="${icon}"></ha-icon>` : ""}${label}</div><div class="v ${cls}">${value}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;

class FinanzePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.data = null;
    this.view = "home";
    this.sheet = null;
    this.f = { month: null, search: "", type: "", category: "", account: "" };
    this.rep = { mode: "mese", month: null, year: null };
    this.settingsDraft = null;
    this._built = false;
  }

  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (first) this._subscribe();
  }
  get hass() { return this._hass; }
  set narrow(v) { this._narrow = v; if (this._built) this._renderHeader(); }
  set panel(p) { this._panel = p; }

  connectedCallback() {
    if (!this._built) this._build();
    if (this._hass && !this._unsub) this._subscribe();
  }
  disconnectedCallback() {
    if (this._unsub) { this._unsub.then((u) => u && u()).catch(() => {}); this._unsub = null; }
  }

  _subscribe() {
    if (!this._hass || this._unsub) return;
    if (!this._built) this._build();
    this._unsub = this._hass.connection.subscribeMessage((d) => this._onData(d), { type: "finanze/subscribe" });
    this._unsub.catch((e) => { this._unsub = null; this.$main.innerHTML = `<div class="loading">Errore: ${esc(e.message || e.code || e)}</div>`; });
  }

  _onData(d) {
    const firstLoad = !this.data;
    this.data = d;
    if (firstLoad) this._renderHeader();
    const now = ym(d.today);
    if (!this.f.month) this.f.month = now;
    if (!this.rep.month) { this.rep.month = now; this.rep.year = Number(d.today.slice(0, 4)); }
    this._renderMain();
  }

  ws(type, extra = {}) { return this._hass.callWS({ type, ...extra }); }

  /* -------------------------------------------------------------- struttura */
  _build() {
    this._built = true;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <div class="app"><header></header><main><div class="loading">Caricamento…</div></main><div id="fab"></div><nav></nav></div>
      <div id="layer"></div>`;
    this.$header = this.shadowRoot.querySelector("header");
    this.$main = this.shadowRoot.querySelector("main");
    this.$nav = this.shadowRoot.querySelector("nav");
    this.$fab = this.shadowRoot.getElementById("fab");
    this.$layer = this.shadowRoot.getElementById("layer");
    this._renderHeader();
    this._renderNav();
    this.shadowRoot.addEventListener("click", (e) => this._onClick(e));
    this.shadowRoot.addEventListener("input", (e) => this._onInput(e));
    this.shadowRoot.addEventListener("change", (e) => this._onChange(e));
  }

  _renderHeader() {
    const title = VIEWS.find((v) => v[0] === this.view)?.[1] || "Finanze";
    this.$header.innerHTML = `${this._narrow !== false ? `<button class="ib" data-a="menu" aria-label="Menu">${svg(ICON.menu)}</button>` : ""}
      <div class="tt"><h1>${this.view === "home" ? "Finanze" : esc(title)}</h1>
      <div class="who">${this.data?.user ? "Archivio di " + esc(this.data.user) : "Finanze personali"}</div></div>`;
  }
  _renderNav() {
    this.$nav.innerHTML = VIEWS.map(([k, label, p]) =>
      `<button data-a="view" data-v="${k}" class="${this.view === k ? "on" : ""}">${svg(p)}<span>${label}</span></button>`).join("");
  }

  _renderMain() {
    if (!this.data) return;
    const top = this.$main.scrollTop;
    const keepScroll = this._keepScroll;
    this._keepScroll = false;
    const fn = { home: this._home, movimenti: this._movimenti, report: this._report, fisse: this._fisse, impostazioni: this._settings }[this.view];
    this.$main.innerHTML = `<div class="wrap">${fn.call(this)}</div>`;
    this.$fab.innerHTML = ["home", "movimenti"].includes(this.view) ? `<button class="fab" data-a="add" aria-label="Aggiungi">${svg(ICON.plus)}</button>` : "";
    if (keepScroll) this.$main.scrollTop = top;
  }

  toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    this.shadowRoot.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  /* ------------------------------------------------------------------- dati */
  get movements() { return this.data.movements; }
  _monthMovs(k) { return this.movements.filter((m) => ym(m.date) === k); }
  _accounts() { return this.data.accounts.map((a) => a.name); }
  _catFreq(type) {
    const c = new Map();
    for (const m of this.movements) if (m.type === type && m.category) c.set(m.category, (c.get(m.category) || 0) + 1);
    const all = [...this.data.categories];
    for (const k of c.keys()) if (!all.includes(k)) all.push(k);
    return all.sort((a, b) => (c.get(b) || 0) - (c.get(a) || 0));
  }
  _lastOf(type) {
    for (let i = this.movements.length - 1; i >= 0; i--) if (this.movements[i].type === type) return this.movements[i];
    return null;
  }

  _movRow(m) {
    const icoStyle = m.type === "trasferimento" ? "background:rgba(255,255,255,.07);color:rgba(255,255,255,.75)" : tint(m.category);
    const letter = `<ha-icon icon="${m.type === "trasferimento" ? "mdi:swap-horizontal" : catIcon(m.category)}"></ha-icon>`;
    const title = m.description || m.category || TIPI[m.type];
    const sub = m.type === "trasferimento"
      ? `${esc(m.account)} → ${esc(m.to_account)}`
      : [m.category, m.account, m.method].filter(Boolean).map(esc).join(" · ");
    const cls = m.type === "entrata" ? "in" : m.type === "uscita" ? "out" : "tr";
    const sign = m.type === "entrata" ? "+" : m.type === "uscita" ? "−" : "";
    return `<div class="item" data-a="edit" data-id="${m.id}">
      <div class="ico" style="${icoStyle}">${letter}</div>
      <div class="grow"><div class="ell">${esc(title)}</div><div class="sec ell">${sub}${m.note ? ` · <i>${esc(m.note)}</i>` : ""}</div></div>
      <div class="amt ${cls}">${sign}${eur(m.amount)}</div></div>`;
  }

  _bars(rows, total, onTap) {
    if (!rows.length) return `<div class="empty">Nessuna uscita</div>`;
    const max = rows[0].total || 1;
    return rows.map((r) => `<div style="padding:7px 0;${onTap ? "cursor:pointer" : ""}" ${onTap ? `data-a="${onTap}" data-k="${esc(r.name)}"` : ""}>
      <div class="row"><span class="grow ell">${esc(r.name)} <span class="sec">· ${r.n}</span></span>
      <span class="sec">${total ? Math.round((r.total / total) * 100) + "%" : ""}</span><b style="font-weight:500;min-width:84px;text-align:right">${eur(r.total)}</b></div>
      <div class="bar"><i style="width:${(r.total / max) * 100}%"></i></div></div>`).join("");
  }

  _dueRows(list, today) {
    return list.map((r) => {
      const late = r.next_due < today;
      return `<div class="duerow"><div class="row">
        <div class="ico" style="${tint(r.category)}"><ha-icon icon="${catIcon(r.category)}"></ha-icon></div>
        <div class="grow"><div class="ell" style="font-weight:700">${esc(r.name)} ${r.to_verify ? '<span class="badge">da verificare</span>' : ""}</div>
        <div class="sec">${late ? "Scaduta il " : "Scade il "}${dShort(r.next_due)}${r.account ? " · " + esc(r.account) : ""}</div></div>
        <b>${eur(r.amount)}</b></div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px">
          <button class="btn flat sm" data-a="rec-skip" data-id="${r.id}">Salta</button>
          <button class="btn sm" data-a="rec-reg" data-id="${r.id}">Registra</button></div></div>`;
    }).join("");
  }

  /* ------------------------------------------------------------------- HOME */
  _home() {
    const d = this.data, today = d.today, k = ym(today);
    const bal = balances(d);
    const total = Object.values(bal).reduce((a, b) => a + b, 0);
    const accs = d.accounts.filter((a) => !a.hidden || Math.abs(bal[a.name] || 0) > 0.004);
    const mm = this._monthMovs(k), t = totals(mm);
    const due = d.recurring.filter((r) => recActive(r) && r.next_due <= today).sort((a, b) => a.next_due.localeCompare(b.next_due));
    const soon = d.recurring.filter((r) => recActive(r) && r.next_due > today && (parseD(r.next_due) - parseD(today)) / 864e5 <= 14)
      .sort((a, b) => a.next_due.localeCompare(b.next_due));
    const cats = groupSum(mm, "category").slice(0, 5);
    const last = [...this.movements].slice(-6).reverse();
    const pct = t.entrate ? Math.min(100, (t.uscite / t.entrate) * 100) : (t.uscite ? 100 : 0);
    return `
      <div class="card hero"><div class="row"><ha-icon icon="mdi:wallet-outline" style="color:var(--acc);--mdc-icon-size:22px"></ha-icon><span class="lbl">Saldo attuale</span></div>
        <div class="big">${eur(total)}</div>
        <div class="tiles">${accs.map((a) => tile(esc(a.name), eur(bal[a.name] || 0), (bal[a.name] || 0) < 0 ? "out" : "", "", a.name.toLowerCase() === "contanti" ? "mdi:cash" : "mdi:bank-outline")).join("")}</div></div>
      ${due.length ? `<div class="card due">${hd("mdi:bell-ring-outline", "Spese fisse da registrare", due.length === 1 ? "1 scadenza" : due.length + " scadenze")}${this._dueRows(due, today)}</div>` : ""}
      <div class="card">${hd("mdi:calendar-month-outline", ymLabel(k), t.n + " operazioni")}
        <div class="kpi">${tile("Entrate", eur(t.entrate), "in")}${tile("Uscite", eur(t.uscite), "out")}${tile("Netto", eur(t.netto), t.netto < 0 ? "out" : "in")}</div>
        <div class="bar" style="height:8px;margin-top:14px"><i style="width:${pct}%;${pct >= 100 ? "background:var(--out)" : ""}"></i></div>
        <div class="sec" style="margin-top:6px">${t.entrate ? `Hai speso il ${Math.round((t.uscite / t.entrate) * 100)}% delle entrate del mese` : "Nessuna entrata registrata questo mese"}</div></div>
      ${cats.length ? `<div class="card">${hd("mdi:chart-donut", "Dove vanno i soldi", "Uscite di " + MONTHS[Number(k.slice(5)) - 1].toLowerCase() + " · tocca per i dettagli")}${this._bars(cats, t.uscite, "cat-filter")}</div>` : ""}
      ${soon.length ? `<div class="card">${hd("mdi:calendar-clock", "In arrivo", "Prossimi 14 giorni")}${soon.map((r) => `<div class="row" style="padding:6px 0">
        <span class="grow ell">${esc(r.name)}</span><span class="sec">${dShort(r.next_due)}</span><b style="min-width:80px;text-align:right">${eur(r.amount)}</b></div>`).join("")}</div>` : ""}
      <div class="card">${hd("mdi:history", "Ultimi movimenti", "", `<button class="pill" data-a="view" data-v="movimenti">Tutti<ha-icon icon="mdi:chevron-right"></ha-icon></button>`)}
        <div class="list">${last.map((m) => this._movRow(m)).join("") || '<div class="empty">Ancora nessun movimento. Tocca + per iniziare.</div>'}</div></div>`;
  }

  /* -------------------------------------------------------------- MOVIMENTI */
  _filtered() {
    const f = this.f, q = f.search.trim().toLowerCase();
    return this.movements.filter((m) =>
      (f.month === "all" || ym(m.date) === f.month) &&
      (!f.type || m.type === f.type) &&
      (!f.category || m.category === f.category) &&
      (!f.account || m.account === f.account || m.to_account === f.account) &&
      (!q || `${m.description} ${m.category} ${m.note} ${m.method} ${m.account} ${String(m.amount).replace(".", ",")}`.toLowerCase().includes(q)));
  }
  _movimenti() {
    const f = this.f;
    const cats = this._catFreq("uscita");
    return `
      <div class="card" style="padding:12px">
        <div class="mbar"><button class="ib" data-a="m-prev" ${f.month === "all" ? "disabled" : ""}>${svg(ICON.left)}</button>
          <b>${f.month === "all" ? "Tutti i mesi" : ymLabel(f.month)}</b>
          <button class="ib" data-a="m-next" ${f.month === "all" ? "disabled" : ""}>${svg(ICON.right)}</button></div>
        <input type="search" placeholder="Cerca descrizione, categoria, importo…" data-f="search" value="${esc(f.search)}" style="margin:8px 0">
        <div class="chips">
          ${[["", "Tutti"], ["uscita", "Uscite"], ["entrata", "Entrate"], ["trasferimento", "Trasferimenti"]].map(([v, l]) =>
            `<button class="chip ${f.type === v ? "on" : ""}" data-a="f-type" data-v="${v}">${l}</button>`).join("")}
          <button class="chip ${f.month === "all" ? "on" : ""}" data-a="f-all">Tutti i mesi</button>
        </div>
        <div class="g2" style="margin-top:8px">
          <select data-f="category"><option value="">Tutte le categorie</option>${cats.map((c) => `<option ${f.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
          <select data-f="account"><option value="">Tutti i conti</option>${this._accounts().map((c) => `<option ${f.account === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        </div>
      </div>
      <div id="mlist">${this._movList()}</div>`;
  }
  _movList() {
    const list = this._filtered();
    const t = totals(list);
    if (!list.length) return `<div class="card empty">Nessun movimento trovato</div>`;
    const byDay = new Map();
    for (const m of [...list].reverse()) { if (!byDay.has(m.date)) byDay.set(m.date, []); byDay.get(m.date).push(m); }
    let html = `<div class="kpi">${tile("Entrate", eur(t.entrate), "in")}${tile("Uscite", eur(t.uscite), "out")}${tile("Movimenti", list.length)}</div>
      <div class="card" style="padding:4px 16px 8px;margin-top:12px">`;
    for (const [day, items] of byDay) {
      const d = parseD(day), dt = totals(items);
      html += `<div class="day"><span>${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}${this.f.month === "all" ? " " + d.getFullYear() : ""}</span>
        <span>${dt.uscite ? "−" + eur(dt.uscite) : ""}</span></div><div class="list">${items.map((m) => this._movRow(m)).join("")}</div>`;
    }
    return html + "</div>";
  }

  /* ----------------------------------------------------------------- REPORT */
  _report() {
    const r = this.rep, d = this.data;
    let list, label, months;
    if (r.mode === "mese") {
      list = this._monthMovs(r.month); label = ymLabel(r.month);
      months = Array.from({ length: 12 }, (_, i) => shiftYm(r.month, i - 11));
    } else {
      list = this.movements.filter((m) => m.date.startsWith(String(r.year))); label = `Anno ${r.year}`;
      months = Array.from({ length: 12 }, (_, i) => `${r.year}-${pad(i + 1)}`);
    }
    const first = this.movements.length ? ym(this.movements[0].date) : r.month;
    months = months.filter((k) => k >= first && k <= ym(d.today));
    const t = totals(list);
    const cats = groupSum(list, "category");
    const meth = groupSum(list, "method");
    const accs = groupSum(list, "account");
    const fixedCats = ["Mutuo", "Finanziamento", "Abbonamenti"];
    const fixed = cats.filter((c) => fixedCats.includes(c.name));
    const series = months.map((k) => ({ k, ...totals(this._monthMovs(k)) }));
    const saving = t.entrate ? Math.round((t.netto / t.entrate) * 100) : null;
    return `
      <div class="card" style="padding:12px">
        <div class="seg"><button class="${r.mode === "mese" ? "on" : ""}" data-a="r-mode" data-v="mese">Mese</button>
          <button class="${r.mode === "anno" ? "on" : ""}" data-a="r-mode" data-v="anno">Anno</button></div>
        <div class="mbar" style="margin-top:8px"><button class="ib" data-a="r-prev">${svg(ICON.left)}</button><b>${label}</b>
          <button class="ib" data-a="r-next">${svg(ICON.right)}</button></div></div>
      <div class="card">${hd("mdi:finance", label, t.n + " operazioni")}<div class="kpi">${tile("Entrate", eur(t.entrate), "in")}${tile("Uscite", eur(t.uscite), "out")}${tile("Netto", eur(t.netto), t.netto < 0 ? "out" : "in")}</div>
        ${saving !== null ? `<div class="sec" style="margin-top:10px">Risparmio: ${saving}% delle entrate</div>` : ""}</div>
      ${series.length > 1 ? `<div class="card chart">${hd("mdi:chart-bar", "Andamento mensile", "Entrate e uscite")}${this._chart(series)}
        <div class="legend"><span><i style="background:var(--in)"></i>Entrate</span><span><i style="background:var(--out)"></i>Uscite</span></div>
        <table style="margin-top:10px"><tr><th>Mese</th><th>Entrate</th><th>Uscite</th><th>Netto</th></tr>
        ${[...series].reverse().map((s) => `<tr><td>${MONTHS_SHORT[Number(s.k.slice(5)) - 1]} ${s.k.slice(2, 4)}</td><td class="in">${eur0(s.entrate)}</td>
          <td class="out">${eur0(s.uscite)}</td><td class="${s.netto < 0 ? "out" : "in"}">${eur0(s.netto)}</td></tr>`).join("")}</table></div>` : ""}
      <div class="card">${hd("mdi:shape-outline", "Uscite per categoria", "Tocca per i dettagli")}${this._bars(cats, t.uscite, "cat-filter-rep")}</div>
      ${fixed.length ? `<div class="card">${hd("mdi:calendar-sync", "Mutuo, finanziamenti, abbonamenti", eur(fixed.reduce((a, b) => a + b.total, 0)))}${this._bars(fixed, t.uscite)}</div>` : ""}
      <div class="card">${hd("mdi:credit-card-outline", "Per metodo di pagamento")}${this._bars(meth, t.uscite)}</div>
      <div class="card">${hd("mdi:bank-outline", "Per conto")}${this._bars(accs, t.uscite)}</div>
      <div class="sec" style="padding:0 4px">I trasferimenti tra conti (prelievi, conto deposito) non contano né come entrate né come uscite.</div>`;
  }
  _chart(series) {
    const W = 340, H = 150, pl = 4, pb = 18, n = series.length;
    const max = Math.max(1, ...series.map((s) => Math.max(s.entrate, s.uscite)));
    const gw = (W - pl * 2) / n, bw = Math.min(14, gw / 2.8);
    let g = "";
    series.forEach((s, i) => {
      const x = pl + i * gw + gw / 2;
      const he = ((H - pb - 6) * s.entrate) / max, hu = ((H - pb - 6) * s.uscite) / max;
      g += `<rect x="${x - bw - 1}" y="${H - pb - he}" width="${bw}" height="${he}" rx="2" fill="var(--in)"/>
        <rect x="${x + 1}" y="${H - pb - hu}" width="${bw}" height="${hu}" rx="2" fill="var(--out)"/>
        <text x="${x}" y="${H - 5}" text-anchor="middle">${MONTHS_SHORT[Number(s.k.slice(5)) - 1]}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img"><line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="var(--line)"/>${g}</svg>`;
  }

  /* ------------------------------------------------------------ SPESE FISSE */
  _fisse() {
    const d = this.data, today = d.today;
    const active = d.recurring.filter(recActive).sort((a, b) => a.next_due.localeCompare(b.next_due));
    const ended = d.recurring.filter((r) => !recActive(r));
    const monthly = active.reduce((a, r) => a + r.amount / (r.cadence_months || 1), 0);
    const byCat = new Map();
    for (const r of active) byCat.set(r.category || "Altro", (byCat.get(r.category || "Altro") || 0) + r.amount / (r.cadence_months || 1));
    const due = active.filter((r) => r.next_due <= today);
    const row = (r) => `<div class="item" data-a="rec-edit" data-id="${r.id}">
      <div class="ico" style="${tint(r.category)}"><ha-icon icon="${catIcon(r.category)}"></ha-icon></div>
      <div class="grow"><div class="ell">${esc(r.name)} ${r.to_verify ? '<span class="badge">da verificare</span>' : ""}</div>
        <div class="sec ell">${CADENZE[r.cadence_months] || r.cadence_months + " mesi"} · ${recActive(r) ? `prossima ${dShort(r.next_due)}` : "terminata"}${r.end_date && recActive(r) ? ` · fino a ${MONTHS_SHORT[parseD(r.end_date).getMonth()]} ${parseD(r.end_date).getFullYear()}` : ""}</div></div>
      <div class="amt">${eur(r.amount)}</div></div>`;
    return `
      <div class="card hero"><div class="row"><ha-icon icon="mdi:calendar-sync" style="color:var(--acc);--mdc-icon-size:22px"></ha-icon><span class="lbl">Totale mensile</span></div>
        <div class="big">${eur(monthly)}</div>
        <div class="tiles">${[...byCat].sort((a, b) => b[1] - a[1]).map(([k, v]) => tile(esc(k), eur(v), "", "", catIcon(k))).join("")}</div>
        <div class="sec" style="margin-top:10px">Le spese annuali o trimestrali sono ripartite al mese.</div></div>
      ${due.length ? `<div class="card due">${hd("mdi:bell-ring-outline", "Da registrare")}${this._dueRows(due, today)}</div>` : ""}
      <div class="card">${hd("mdi:calendar-sync", "Attive", active.length + " spese", `<button class="pill on" data-a="rec-new"><ha-icon icon="mdi:plus"></ha-icon>Aggiungi</button>`)}
        <div class="list">${active.map(row).join("") || '<div class="empty">Nessuna spesa fissa</div>'}</div></div>
      ${ended.length ? `<div class="card">${hd("mdi:calendar-check-outline", "Terminate", ended.length + " spese")}<div class="list">${ended.map(row).join("")}</div></div>` : ""}`;
  }

  /* ---------------------------------------------------------- IMPOSTAZIONI */
  _settings() {
    const d = this.data;
    if (!this._targets && !this._loadingTargets) {
      this._loadingTargets = true;
      this.ws("finanze/notify_targets").then((t) => { this._targets = t; this._keepScroll = true; if (this.view === "impostazioni") this._renderMain(); }).catch(() => { this._targets = []; });
    }
    if (!this.settingsDraft) {
      this.settingsDraft = {
        accounts: d.accounts.map((a) => ({ ...a, orig: a.name })),
        categories: d.categories.map((c) => ({ name: c, orig: c })),
        methods: d.methods.map((c) => ({ name: c, orig: c })),
      };
    }
    const s = this.settingsDraft;
    const used = (key, v) => this.movements.filter((m) => m[key] === v || (key === "account" && m.to_account === v)).length +
      d.recurring.filter((r) => r[key] === v).length;
    const listEd = (key, field, title) => `<div class="card">${hd(key === "categories" ? "mdi:shape-outline" : "mdi:credit-card-outline", title, "", `<button class="pill" data-a="s-add" data-k="${key}"><ha-icon icon="mdi:plus"></ha-icon>Aggiungi</button>`)}
      ${s[key].map((c, i) => { const n = c.orig ? used(field, c.orig) : 0; return `<div class="ed two"><input data-s="${key}" data-i="${i}" data-p="name" value="${esc(c.name)}" placeholder="Nome">
        <button class="ib ${n ? "" : "danger"}" data-a="s-del" data-k="${key}" data-i="${i}" ${n ? `disabled title="Usata in ${n} movimenti"` : ""} aria-label="Elimina">${n ? `<span class="sec" style="font-size:12px">${n}</span>` : svg(ICON.del)}</button></div>`; }).join("")}</div>`;
    return `
      <div class="card">${hd("mdi:bank-outline", "Conti", "Nome e saldo iniziale", `<button class="pill" data-a="s-add" data-k="accounts"><ha-icon icon="mdi:plus"></ha-icon>Aggiungi</button>`)}
        <div class="ed sec" style="font-size:12px"><span>Nome</span><span>Saldo iniziale</span><span></span></div>
        ${s.accounts.map((a, i) => { const n = a.orig ? used("account", a.orig) : 0; return `<div class="ed"><input data-s="accounts" data-i="${i}" data-p="name" value="${esc(a.name)}" placeholder="Nome conto">
          <input data-s="accounts" data-i="${i}" data-p="initial_balance" inputmode="decimal" value="${esc(String(a.initial_balance ?? 0).replace(".", ","))}">
          <button class="ib ${n ? "" : "danger"}" data-a="s-del" data-k="accounts" data-i="${i}" ${n ? "disabled" : ""} aria-label="Elimina">${n ? `<span class="sec" style="font-size:12px">${n}</span>` : svg(ICON.del)}</button></div>`; }).join("")}
        <div class="sec">Il numero a destra indica quanti movimenti usano la voce: le voci in uso si possono rinominare ma non eliminare. Rinominando, i movimenti vengono aggiornati.</div></div>
      ${listEd("categories", "category", "Categorie")}
      ${listEd("methods", "method", "Metodi di pagamento")}
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn flat" data-a="s-reset">Annulla modifiche</button><button class="btn" data-a="s-save">Salva impostazioni</button></div>
      <div class="card">${hd("mdi:database-outline", "Dati", "Import, export e backup")}
        <div class="sec" style="margin-bottom:10px">I dati sono salvati in Home Assistant (cartella <code>.storage</code>) e inclusi nei backup.</div>
        <div class="chips"><button class="chip" data-a="export-json">Esporta backup (JSON)</button><button class="chip" data-a="export-csv">Esporta movimenti (CSV)</button>
          <button class="chip" data-a="import" data-v="merge">Importa e aggiungi…</button>
          <button class="chip danger" data-a="import" data-v="replace">Importa e sostituisci tutto…</button></div>
        <div class="sec" style="margin-top:8px">Per il primo avvio usa «sostituisci tutto» con il file <code>finanze_import.json</code>.</div>
        <input type="file" id="file" accept=".json,application/json" style="display:none"></div>
      <div class="card">${hd("mdi:bell-outline", "Promemoria spese fisse", "Dispositivi su cui ricevi le notifiche")}
        ${this._targets ? (this._targets.length ? `<div class="chips">${this._targets.map((t) => `<button class="chip ${(d.settings?.notify_services || []).includes(t) ? "on" : ""}" data-a="p-notify" data-v="${esc(t)}">${esc(t.replace("notify.", "").replace("mobile_app_", "").replace(/_/g, " "))}</button>`).join("")}</div>` : '<div class="sec">Nessun dispositivo di notifica trovato.</div>') : '<div class="sec">Caricamento…</div>'}
        <div class="sec" style="margin-top:10px">L'orario si imposta in Impostazioni → Dispositivi e servizi → Finanze → Configura.</div></div>
      <div class="card">${hd("mdi:chart-box-outline", "Sensori in Home Assistant", "Saldo, entrate e uscite come entità")}
        <div class="row"><div class="grow sec">Crea i sensori <code>sensor.finanze_${esc((d.user || "").toLowerCase().replace(/[^a-z0-9]+/g, "_"))}_…</code> da usare nelle tue dashboard e automazioni.
          <b style="color:var(--acc)">Attenzione:</b> le entità di Home Assistant sono visibili a tutti gli utenti.</div>
          <button class="sw ${d.settings?.sensors ? "on" : ""}" data-a="p-sensors" aria-label="Sensori"></button></div></div>
      <div class="sec" style="text-align:center">Finanze ${esc(d.version || "")} · ${this.movements.length} movimenti</div>`;
  }

  /* ----------------------------------------------------------------- SHEETS */
  _openMovement(m) {
    const type = m?.type || "uscita";
    const last = this._lastOf(type) || this._lastOf("uscita");
    const accs = this._accounts();
    this.sheet = {
      kind: "mov", id: m?.id || null, confirm: false,
      draft: m ? { ...m, amount: Number(m.amount).toFixed(2).replace(".", ",") } : {
        type, amount: "", date: this.data.today, description: "", category: "", note: "",
        account: last?.account || accs[0] || "", method: last?.method || "",
        to_account: accs.find((a) => a !== (last?.account || accs[0])) || "",
      },
    };
    this._renderSheet(true);
  }
  _openRecurring(r) {
    const accs = this._accounts();
    this.sheet = {
      kind: "rec", id: r?.id || null, confirm: false,
      draft: r ? { ...r, amount: Number(r.amount).toFixed(2).replace(".", ",") } : {
        name: "", amount: "", category: "Abbonamenti", cadence_months: 1, method: "Addebito diretto",
        account: accs[0] || "", next_due: this.data.today, end_date: "", active: true,
      },
    };
    this._renderSheet(true);
  }
  _closeSheet() { this.sheet = null; this.$layer.innerHTML = ""; }

  _renderSheet(focus = false) {
    const s = this.sheet;
    if (!s) return;
    const body = s.kind === "mov" ? this._movForm(s) : this._recForm(s);
    const open = this.$layer.querySelector(".sheet");
    if (open && !focus) {
      const bd = open.querySelector(".bd"), top = bd ? bd.scrollTop : 0;
      open.innerHTML = body;
      const nbd = open.querySelector(".bd"); if (nbd) nbd.scrollTop = top;
      return;
    }
    this.$layer.innerHTML = `<div class="scrim" data-a="scrim"><div class="sheet" role="dialog">${body}</div></div>`;
    if (focus && s.kind === "mov" && !s.id) {
      const el = this.$layer.querySelector(".amount");
      if (el) setTimeout(() => el.focus(), 60);
    }
  }

  _movForm(s) {
    const d = s.draft;
    const accs = this._accounts();
    const cats = this._catFreq(d.type);
    const yesterday = iso(new Date(parseD(this.data.today).getTime() - 864e5));
    const q = d.description.trim().toLowerCase();
    const seen = new Set(); const sugg = [];
    for (let i = this.movements.length - 1; i >= 0 && sugg.length < 6; i--) {
      const m = this.movements[i];
      if (m.type !== d.type || !m.description) continue;
      const key = m.description.toLowerCase();
      if (seen.has(key) || key === q || (q && !key.includes(q))) continue;
      seen.add(key); sugg.push(m);
    }
    const accOpts = (sel) => accs.map((a) => `<option ${a === sel ? "selected" : ""}>${esc(a)}</option>`).join("");
    return `<div class="hd"><div class="ico"><ha-icon icon="${s.id ? "mdi:pencil-outline" : "mdi:plus"}"></ha-icon></div><h3>${s.id ? "Modifica movimento" : "Nuovo movimento"}</h3><button class="ib" data-a="close">${svg(ICON.close)}</button></div>
      <div class="bd">
        <div class="seg">${Object.entries(TIPI).map(([k, l]) => `<button class="${d.type === k ? "on" : ""}" data-a="d-type" data-v="${k}">${l}</button>`).join("")}</div>
        <input class="amount ${d.type === "entrata" ? "in" : d.type === "uscita" ? "out" : ""}" data-d="amount" inputmode="decimal" placeholder="0,00 €" value="${esc(d.amount)}" autocomplete="off">
        <label class="f">Descrizione<input data-d="description" value="${esc(d.description)}" placeholder="${d.type === "trasferimento" ? "Es. Prelievo bancomat" : "Es. Coop, Netflix, Stipendio…"}" autocomplete="off"></label>
        ${sugg.length ? `<div class="sugg">${sugg.map((m) => `<button class="chip" data-a="d-sugg" data-id="${m.id}">${esc(m.description)}</button>`).join("")}</div>` : ""}
        ${d.type === "trasferimento" ? `<div class="g2"><label class="f">Da conto<select data-d="account">${accOpts(d.account)}</select></label>
            <label class="f">A conto<select data-d="to_account">${accOpts(d.to_account)}</select></label></div>`
        : `<div><div class="lbl" style="margin-bottom:6px">Categoria</div><div class="chips" id="cats">${(s.allCats ? cats : cats.slice(0, 8).concat(d.category && cats.indexOf(d.category) >= 8 ? [d.category] : [])).map((c) =>
            `<button class="chip ${d.category === c ? "on" : ""}" data-a="d-cat" data-v="${esc(c)}">${esc(c)}</button>`).join("")}
            ${cats.length > 8 ? `<button class="chip" data-a="d-allcats">${s.allCats ? "Meno" : `Altre ${cats.length - 8}…`}</button>` : ""}
            <button class="chip" data-a="d-newcat">+ Nuova</button></div>
            ${s.newCat ? `<div class="row" style="margin-top:8px"><input data-d="_newcat" placeholder="Nome nuova categoria" value="${esc(d._newcat || "")}">
              <button class="btn sm" data-a="d-newcat-ok">Aggiungi</button></div>` : ""}</div>
          <div class="g2"><label class="f">Conto<select data-d="account">${accOpts(d.account)}</select></label>
            <label class="f">Metodo<select data-d="method"><option value="">—</option>${this.data.methods.map((x) => `<option ${x === d.method ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label></div>`}
        <div><div class="lbl" style="margin-bottom:6px">Data</div><div class="row">
          <button class="chip ${d.date === this.data.today ? "on" : ""}" data-a="d-date" data-v="${this.data.today}">Oggi</button>
          <button class="chip ${d.date === yesterday ? "on" : ""}" data-a="d-date" data-v="${yesterday}">Ieri</button>
          <input type="date" data-d="date" value="${esc(d.date)}" style="flex:1"></div></div>
        <label class="f">Note<input data-d="note" value="${esc(d.note)}" placeholder="Facoltative, es. Da rimborsare"></label>
      </div>
      <div class="ft">${s.id ? `<button class="btn ${s.confirm ? "warn" : "flat danger"}" data-a="mov-del">${s.confirm ? "Conferma eliminazione" : "Elimina"}</button>` : ""}
        <button class="btn" data-a="mov-save">${s.id ? "Salva modifiche" : "Aggiungi"}</button></div>`;
  }

  _recForm(s) {
    const d = s.draft;
    return `<div class="hd"><div class="ico"><ha-icon icon="mdi:calendar-sync"></ha-icon></div><h3>${s.id ? "Spesa fissa" : "Nuova spesa fissa"}</h3><button class="ib" data-a="close">${svg(ICON.close)}</button></div>
      <div class="bd">
        <label class="f">Nome<input data-d="name" value="${esc(d.name)}" placeholder="Es. Netflix"></label>
        <div class="g2"><label class="f">Importo (€)<input data-d="amount" inputmode="decimal" value="${esc(d.amount)}"></label>
          <label class="f">Cadenza<select data-d="cadence_months">${Object.entries(CADENZE).map(([k, l]) => `<option value="${k}" ${Number(d.cadence_months) === Number(k) ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
        <div class="g2"><label class="f">Categoria<select data-d="category">${this._catFreq("uscita").map((c) => `<option ${c === d.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
          <label class="f">Metodo<select data-d="method"><option value="">—</option>${this.data.methods.map((x) => `<option ${x === d.method ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label></div>
        <label class="f">Conto<select data-d="account">${this._accounts().map((a) => `<option ${a === d.account ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></label>
        <div class="g2"><label class="f">Prossima scadenza<input type="date" data-d="next_due" value="${esc(d.next_due || "")}"></label>
          <label class="f">Ultima rata (facoltativa)<input type="date" data-d="end_date" value="${esc(d.end_date || "")}"></label></div>
        <label class="row" style="font-size:15px"><input type="checkbox" data-d="active" ${d.active !== false ? "checked" : ""} style="width:22px;height:22px;-webkit-appearance:checkbox;appearance:auto"> Attiva</label>
        ${d.to_verify ? '<div class="sec"><span class="badge">da verificare</span> Non ho trovato pagamenti di questa spesa nei movimenti importati: controlla la data della prossima scadenza.</div>' : ""}
      </div>
      <div class="ft">${s.id ? `<button class="btn ${s.confirm ? "warn" : "flat danger"}" data-a="rec-del">${s.confirm ? "Conferma" : "Elimina"}</button>
        <button class="btn flat" data-a="rec-reg-now" data-id="${s.id}">Registra ora</button>` : ""}
        <button class="btn" data-a="rec-save">Salva</button></div>`;
  }

  /* ----------------------------------------------------------------- eventi */
  async _onClick(e) {
    const el = e.target.closest("[data-a]");
    if (!el) return;
    const a = el.dataset.a, id = el.dataset.id, v = el.dataset.v;
    if (a === "scrim" && e.target !== el) return; // click dentro il foglio
    const s = this.sheet;
    try {
      switch (a) {
        case "menu": this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true })); break;
        case "view":
          this.view = v; this.$main.scrollTop = 0;
          if (v !== "impostazioni") this.settingsDraft = null;
          this._renderHeader(); this._renderNav(); this._renderMain(); break;
        case "add": this._openMovement(null); break;
        case "edit": this._openMovement(this.movements.find((m) => m.id === id)); break;
        case "close": case "scrim": this._closeSheet(); break;
        case "cat-filter": this.f = { ...this.f, category: el.dataset.k, month: ym(this.data.today), type: "uscita" }; this.view = "movimenti"; this._renderHeader(); this._renderNav(); this._renderMain(); break;
        case "cat-filter-rep":
          this.f = { ...this.f, category: el.dataset.k, type: "uscita", month: this.rep.mode === "mese" ? this.rep.month : "all", search: this.rep.mode === "anno" ? "" : this.f.search };
          this.view = "movimenti"; this._renderHeader(); this._renderNav(); this._renderMain(); break;
        // filtri movimenti
        case "m-prev": this.f.month = shiftYm(this.f.month, -1); this._renderMain(); break;
        case "m-next": this.f.month = shiftYm(this.f.month, 1); this._renderMain(); break;
        case "f-all": this.f.month = this.f.month === "all" ? ym(this.data.today) : "all"; this._renderMain(); break;
        case "f-type": this.f.type = v; this._keepScroll = true; this._renderMain(); break;
        // report
        case "r-mode": this.rep.mode = v; this._renderMain(); break;
        case "r-prev": case "r-next": {
          const n = a === "r-prev" ? -1 : 1;
          if (this.rep.mode === "mese") this.rep.month = shiftYm(this.rep.month, n); else this.rep.year += n;
          this._keepScroll = true; this._renderMain(); break;
        }
        // foglio movimento
        case "d-type": {
          s.draft.type = v; s.draft.category = "";
          if (v === "trasferimento" && (!s.draft.to_account || s.draft.to_account === s.draft.account))
            s.draft.to_account = this._accounts().find((x) => x !== s.draft.account) || "";
          this._renderSheet(); break;
        }
        case "d-allcats": s.allCats = !s.allCats; this._renderSheet(); break;
        case "d-cat": s.draft.category = s.draft.category === v ? "" : v; this._renderSheet(); break;
        case "d-date": s.draft.date = v; this._renderSheet(); break;
        case "d-newcat": s.newCat = !s.newCat; this._renderSheet(); this.$layer.querySelector('[data-d="_newcat"]')?.focus(); break;
        case "d-newcat-ok": {
          const name = (s.draft._newcat || "").trim();
          if (name) { if (!this.data.categories.includes(name)) this.data.categories.push(name); s.draft.category = name; }
          s.newCat = false; s.draft._newcat = ""; this._renderSheet(); break;
        }
        case "d-sugg": {
          const m = this.movements.find((x) => x.id === id);
          if (m) Object.assign(s.draft, { description: m.description, category: m.category, account: m.account, method: m.method, to_account: m.to_account || s.draft.to_account });
          if (m && !s.draft.amount && /abbonament|finanziament|mutuo/i.test(m.category)) s.draft.amount = Number(m.amount).toFixed(2).replace(".", ",");
          this._renderSheet(); break;
        }
        case "mov-save": await this._saveMovement(); break;
        case "mov-del":
          if (!s.confirm) { s.confirm = true; this._renderSheet(); break; }
          await this.ws("finanze/movement/delete", { id_movimento: s.id }); this._closeSheet(); this.toast("Movimento eliminato"); break;
        // spese fisse
        case "rec-new": this._openRecurring(null); break;
        case "rec-edit": this._openRecurring(this.data.recurring.find((r) => r.id === id)); break;
        case "rec-save": await this._saveRecurring(); break;
        case "rec-del":
          if (!s.confirm) { s.confirm = true; this._renderSheet(); break; }
          await this.ws("finanze/recurring/delete", { id_spesa: s.id }); this._closeSheet(); this.toast("Spesa fissa eliminata"); break;
        case "rec-reg": case "rec-reg-now": {
          el.disabled = true;
          const m = await this.ws("finanze/recurring/register", { id_spesa: id, ...(a === "rec-reg-now" ? { date: this.data.today } : {}) });
          if (a === "rec-reg-now") this._closeSheet();
          this.toast(`Registrata: ${m.description} ${eur(m.amount)}`); break;
        }
        case "rec-skip": el.disabled = true; await this.ws("finanze/recurring/skip", { id_spesa: id }); this.toast("Scadenza saltata"); break;
        // impostazioni
        case "s-add": this.settingsDraft[el.dataset.k].push(el.dataset.k === "accounts" ? { name: "", initial_balance: 0 } : { name: "" }); this._keepScroll = true; this._renderMain(); break;
        case "s-del": this.settingsDraft[el.dataset.k].splice(Number(el.dataset.i), 1); this._keepScroll = true; this._renderMain(); break;
        case "s-reset": this.settingsDraft = null; this._keepScroll = true; this._renderMain(); break;
        case "s-save": await this._saveSettings(); break;
        case "p-notify": {
          const cur = new Set(this.data.settings?.notify_services || []);
          cur.has(v) ? cur.delete(v) : cur.add(v);
          this._keepScroll = true;
          await this.ws("finanze/prefs/save", { notify_services: [...cur] });
          const dev = v.replace("notify.", "").replace("mobile_app_", "").replace(/_/g, " ");
          this.toast(cur.has(v) ? `Notifiche attive su ${dev}` : `Notifiche disattivate su ${dev}`); break;
        }
        case "p-sensors": {
          const on = !this.data.settings?.sensors;
          this._keepScroll = true;
          await this.ws("finanze/prefs/save", { sensors: on });
          this.toast(on ? "Sensori creati" : "Sensori rimossi"); break;
        }
        case "export-json": this._download(`finanze-${this.data.today}.json`, JSON.stringify(await this.ws("finanze/export"), null, 1), "application/json"); break;
        case "export-csv": this._download(`finanze-movimenti-${this.data.today}.csv`, this._csv(), "text/csv"); break;
        case "import": this._importMode = v; this.shadowRoot.getElementById("file").click(); break;
      }
    } catch (err) {
      this.toast(err?.message || String(err));
      if (el.disabled !== undefined) el.disabled = false;
    }
  }

  _onInput(e) {
    const t = e.target;
    if (t.dataset.f === "search") {
      this.f.search = t.value;
      const box = this.shadowRoot.getElementById("mlist");
      if (box) box.innerHTML = this._movList();
    } else if (t.dataset.d && this.sheet) {
      this.sheet.draft[t.dataset.d] = t.type === "checkbox" ? t.checked : t.value;
      if (t.dataset.d === "description" && this.sheet.kind === "mov") this._refreshSugg();
    } else if (t.dataset.s) {
      const row = this.settingsDraft[t.dataset.s][Number(t.dataset.i)];
      row[t.dataset.p] = t.value;
    }
  }
  _onChange(e) {
    const t = e.target;
    if (t.id === "file") return this._import(t.files[0]);
    if (t.dataset.f === "category" || t.dataset.f === "account") { this.f[t.dataset.f] = t.value; this._renderMain(); }
    else if (t.dataset.d && this.sheet) {
      this.sheet.draft[t.dataset.d] = t.type === "checkbox" ? t.checked : t.value;
      if (t.dataset.d === "date") this._renderSheet();
    }
  }
  _refreshSugg() {
    // aggiorna solo i suggerimenti, senza perdere il focus del campo
    const tmp = document.createElement("div");
    tmp.innerHTML = this._movForm(this.sheet);
    const fresh = tmp.querySelector(".sugg");
    const old = this.$layer.querySelector(".sugg");
    const anchor = this.$layer.querySelector('[data-d="description"]').closest("label");
    if (old) old.remove();
    if (fresh) anchor.after(fresh);
  }

  async _saveMovement() {
    const s = this.sheet, d = s.draft;
    const amount = num(d.amount);
    if (!(amount > 0)) { this.toast("Inserisci un importo"); this.$layer.querySelector(".amount")?.focus(); return; }
    if (d.type !== "trasferimento" && !d.category) { this.toast("Scegli una categoria"); return; }
    if (d.type === "trasferimento" && d.account === d.to_account) { this.toast("Scegli due conti diversi"); return; }
    const movement = {
      type: d.type, amount, date: d.date || this.data.today, description: d.description.trim(),
      category: d.type === "trasferimento" ? (d.category || "Trasferimento") : d.category,
      account: d.account, to_account: d.type === "trasferimento" ? d.to_account : "",
      method: d.method || "", note: (d.note || "").trim(),
    };
    if (s.id) await this.ws("finanze/movement/update", { id_movimento: s.id, movement });
    else await this.ws("finanze/movement/add", { movement });
    this._closeSheet();
    this.toast(s.id ? "Modifiche salvate" : `Aggiunto ${eur(amount)}`);
  }

  async _saveRecurring() {
    const d = this.sheet.draft;
    const amount = num(d.amount);
    if (!d.name.trim()) { this.toast("Dai un nome alla spesa"); return; }
    if (!(amount > 0)) { this.toast("Inserisci un importo"); return; }
    const due = d.next_due || this.data.today;
    await this.ws("finanze/recurring/save", { item: {
      ...(this.sheet.id ? { id: this.sheet.id } : {}),
      name: d.name.trim(), amount, category: d.category, cadence_months: Number(d.cadence_months),
      method: d.method, account: d.account, next_due: due, day_of_month: parseD(due).getDate(),
      end_date: d.end_date || null, active: d.active !== false,
    } });
    this._closeSheet();
    this.toast("Spesa fissa salvata");
  }

  async _saveSettings() {
    const s = this.settingsDraft;
    const renames = { accounts: {}, categories: {}, methods: {} };
    const clean = (key) => s[key].filter((x) => String(x.name).trim()).map((x) => {
      if (x.orig && x.orig !== x.name.trim()) renames[key][x.orig] = x.name.trim();
      return x;
    });
    const accounts = clean("accounts").map((a) => ({ name: a.name.trim(), initial_balance: num(a.initial_balance) || 0, hidden: !!a.hidden }));
    await this.ws("finanze/settings/save", {
      accounts, categories: clean("categories").map((c) => c.name.trim()),
      methods: clean("methods").map((c) => c.name.trim()), renames,
    });
    this.settingsDraft = null;
    this.toast("Impostazioni salvate");
  }

  async _import(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const res = await this.ws("finanze/import", { payload, mode: this._importMode === "replace" ? "replace" : "merge" });
      this.settingsDraft = null;
      this.toast(`Importati: ${res.movimenti} movimenti, ${res.spese_fisse} spese fisse`);
    } catch (err) {
      this.toast("Importazione non riuscita: " + (err.message || err));
    }
    this.shadowRoot.getElementById("file").value = "";
  }

  _csv() {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Data", "Tipo", "Categoria", "Descrizione", "Metodo", "Conto", "Conto destinazione", "Importo", "Note", "Inserito da"]];
    for (const m of this.movements) rows.push([m.date, TIPI[m.type], m.category, m.description, m.method, m.account, m.to_account, String(m.amount).replace(".", ","), m.note, m.created_by]);
    return "﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n");
  }
  _download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

if (!customElements.get("finanze-panel")) customElements.define("finanze-panel", FinanzePanel);
