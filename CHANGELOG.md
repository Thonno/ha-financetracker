# Changelog

All notable changes to FinanceTracker are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.4.0] - 2026-11-26

### Added

- **Monthly budgets per category.** Set a monthly spending limit for the categories you want to keep an eye on, from *Settings → Monthly budgets* or from the new **Budget** card.
  - The Budget card on Home and in the monthly report shows spent, limit and what is left for each category. Bars turn amber at 80 % and red above 100 %, and in the current month a thin line shows how much of the month has passed.
  - **Alerts** at 80 % and 100 %, sent to the devices chosen for recurring expense reminders. Each threshold is notified once per month, and alerts can be turned off.
  - New optional sensor **Budget left this month**, with spent, limit and percentage per category as attributes.
  - Budgets are included in JSON backups and follow a category when it is renamed.
- **Diagnostics**: *Download diagnostics* on the integration page now produces a file with counts and settings only (no names, amounts or descriptions), ready to attach to an issue.
- Automated tests: `pytest` for calculations and the archive, plus a smoke test for the panel (`node tests/panel_smoke.js`).
- This changelog.

## [2.3.3] - 2026-11-16

### Changed

- Panel: the FinanceTracker logo is shown in the Home header.

## [2.3.2] - 2026-11-16

### Added

- Brand icon and logo, shown by Home Assistant 2026.3 and later.

## [2.3.1] - 2026-11-16

### Added

- **Interest on accounts**: tiered annual rates, tax withholding and daily accrual on the end-of-day balance, recorded automatically as income.

### Fixed

- Recurring expense reminders were not sent because of a helper moved by mistake.

## [2.2.0] - 2026-11-15

First public release.

### Added

- Sidebar panel built for phones, tablets and desktops, with light, dark and automatic theme.
- Accounts, transfers, transactions with search and filters, monthly and yearly reports.
- Recurring expenses with actionable notifications (**Register** / **Skip**).
- One private archive per Home Assistant user, optional sensors, actions for automations.
- Configurable currency, English and Italian translations.
- JSON backup and restore, CSV export and a spreadsheet converter.

[Unreleased]: https://github.com/Thonno/ha-financetracker/compare/2.4.0...HEAD
[2.4.0]: https://github.com/Thonno/ha-financetracker/compare/2.3.3...2.4.0
[2.3.3]: https://github.com/Thonno/ha-financetracker/compare/2.3.2...2.3.3
[2.3.2]: https://github.com/Thonno/ha-financetracker/compare/2.3.1...2.3.2
[2.3.1]: https://github.com/Thonno/ha-financetracker/compare/2.2.0...2.3.1
[2.2.0]: https://github.com/Thonno/ha-financetracker/releases/tag/2.2.0
