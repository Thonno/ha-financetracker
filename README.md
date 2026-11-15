# Finance Tracker for Home Assistant

A personal finance tracker that lives inside Home Assistant. You log income and expenses by hand – no bank connection, no receipt scanning, no cloud service – and get balances, monthly reports and reminders for recurring payments, from a sidebar panel designed for the Home Assistant Companion app on your phone.

> **Language:** the panel's interface is currently in **Italian** (the integration's domain is `finanze`). Translations are welcome – see [Contributing](#contributing).

## Features

- **Sidebar panel built for phones**: a dark, card-based layout with bottom tab navigation. It works in the Companion app and in any browser.
- **Fast entry**: type the amount, then tap a category; your most-used categories are shown first. Tapping a past description fills in its category, account and payment method.
- **Accounts and transfers**: track several accounts (current account, savings, cash, PayPal…), each with an opening balance. Transfers between accounts (ATM withdrawals, moving money to savings) change balances but don't count as income or expenses.
- **Transactions**: browse by month, search, and filter by type, category and account. Edit or delete any entry.
- **Reports** by month or year: income vs. expenses over time, spending by category, by payment method and by account, and a dedicated total for mortgage, loans and subscriptions.
- **Recurring expenses**: monthly, bimonthly, quarterly, half-yearly or yearly, with an optional last-instalment date. When one is due you get an actionable notification with **Register** / **Skip** buttons; answering on one device clears it everywhere.
- **One private archive per Home Assistant user**: each person who opens the panel sees only their own data (see [Privacy](#privacy-and-multi-user-behaviour)).
- **Optional sensors** for dashboards and automations, enabled per user.
- **Actions** (`finanze.aggiungi_movimento`, `finanze.registra_spesa_fissa`) for scripts, automations and voice assistants.
- **Import / export**: JSON backup and restore, CSV export, and a converter for existing spreadsheets.

## Requirements

- Home Assistant 2025.1 or newer
- [HACS](https://hacs.xyz) for the recommended installation
- The Home Assistant Companion app, if you want reminder notifications with action buttons

## Installation

### HACS (recommended)

1. In HACS open the menu (⋮) → **Custom repositories**.
2. Add `https://github.com/Thonno/ha-financetracker` with type **Integration**.
3. Search for **Finanze**, download it, then restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration → Finanze** and choose the time of day for reminders.

### Manual

Copy `custom_components/finanze` into your Home Assistant `config/custom_components/` folder (for example with the Samba or File editor add-on), restart Home Assistant, then add the integration as in step 4 above.

## First steps

1. Open **Finanze** from the sidebar. The subtitle shows whose archive you are in.
2. Go to **Impostazioni** (Settings) and set up your accounts with their opening balances, your categories and your payment methods.
3. Under **Promemoria** (Reminders), tap the devices that should receive your recurring-expense notifications.
4. Add your recurring expenses under **Spese fisse**, then start logging with the **+** button.

## Privacy and multi-user behaviour

- Each Home Assistant user gets a separate archive, stored in `.storage/finanze.utente_<user id>`. The panel, the actions and the reminders only ever read or write the archive of the signed-in user.
- Notification buttons are only accepted from the user who owns the recurring expense.
- Data stays on your Home Assistant instance and is included in its regular backups.
- **Limitation:** Home Assistant has no per-user encryption. An administrator with access to the configuration files or to a backup can read every archive.
- **Sensors are off by default** because Home Assistant entities are visible to every user. Turn them on only if you are comfortable with that.

## Sensors (optional, per user)

Turn them on in **Impostazioni → Sensori in Home Assistant**. `<user>` is the slug of the Home Assistant user name.

| Entity | Value |
|---|---|
| `sensor.finanze_<user>_saldo_totale` | Total balance (`conti` attribute: balance per account) |
| `sensor.finanze_<user>_saldo_<account>` | Balance of one account |
| `sensor.finanze_<user>_entrate_mese` | Income this month |
| `sensor.finanze_<user>_uscite_mese` | Expenses this month (`per_categoria` attribute) |
| `sensor.finanze_<user>_netto_mese` | Net this month |
| `sensor.finanze_<user>_spese_fisse_mensili` | Monthly total of active recurring expenses |
| `sensor.finanze_<user>_scadenze` | Number of recurring expenses waiting to be registered |

## Actions

Both actions write to the archive of the user who runs them. Automations run without a user, so pass `utente` with the Home Assistant user name. Only administrators can write to someone else's archive.

```yaml
action: finanze.aggiungi_movimento
data:
  importo: 12.50           # amount, always positive
  tipo: uscita             # uscita (expense) | entrata (income) | trasferimento (transfer)
  categoria: Groceries
  descrizione: Supermarket
  conto: Current account
  metodo: Debit card
  utente: Mario            # only needed in automations
```

```yaml
action: finanze.registra_spesa_fissa
data:
  spesa: Netflix           # name or id of the recurring expense
  utente: Mario
```

Both actions return the created transaction as response data.

## Import and export

From **Impostazioni → Dati** in the panel:

- **Export backup (JSON)**: your full archive, minus your personal notification settings.
- **Export transactions (CSV)**: semicolon-separated, opens directly in Excel and LibreOffice.
- **Import and add**: merges a JSON file into your archive.
- **Import and replace everything**: overwrites your archive with the file. Your notification settings are kept.

### Coming from a spreadsheet

`tools/excel_to_finanze.py` converts an Excel workbook into the JSON import format. It expects sheets named `Movimenti` (transactions), `Liste` (lists of categories, methods, accounts and opening balances) and `Spese fisse` (recurring expenses). Adapt it to your own layout if needed.

```bash
pip install openpyxl
python3 tools/excel_to_finanze.py my_finances.xlsx finanze_import.json \
    --principale "Current account" --deposito "Savings"
```

Rows in the `Prelievo` (withdrawal) category become transfers to `Contanti` (cash). With `--principale` and `--deposito`, rows in the `Conto deposito` category become transfers between those two accounts. For recurring expenses, the next due date is worked out from the last matching payment; those with no match are flagged *da verificare* (to check).

The JSON format is simple: `accounts`, `categories`, `methods`, `movements` and `recurring`. Export a backup from the panel to see a complete example.

## Contributing

Issues and pull requests are welcome, especially translations of the panel. The panel is a single dependency-free web component, `custom_components/finanze/frontend/finanze-panel.js`, and the calculations live in `logic.py`, which has no Home Assistant imports and is easy to test.

## License

No license has been chosen yet: until one is added, all rights are reserved by the author.
