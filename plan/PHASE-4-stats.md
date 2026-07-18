# Phase 4 — Statistics & dashboard

**Goal:** the unrestricted stats Wallet paywalled — any year, any date range, any
grouping. **At the end of this phase the app surpasses Wallet.**

**Prerequisite:** Phase 3 (stats are only interesting with the full history loaded).

## Tasks

### Stats API
Every endpoint takes arbitrary `from` / `to` plus the same filters as the
transactions list (accounts, categories, labels, type):

- [ ] `GET /api/stats/summary` — income, expenses, net for the range
- [ ] `GET /api/stats/by-category` — grouped totals, subcategory drill-down,
      share-of-total percentages
- [ ] `GET /api/stats/timeseries` — daily/weekly/monthly/yearly buckets
- [ ] `GET /api/stats/compare` — two arbitrary periods side by side, with deltas
- [ ] `GET /api/stats/balances` — per-account running balance over time
      (from `starting_balance_minor` + transaction history)
- [ ] All implemented as SQL GROUP BYs in D1 — no client-side aggregation of raw rows

### Dashboard UI
- [ ] Period picker: this month / last month / this year / **any year** / custom
      range / all time — no gates, ever
- [ ] Category breakdown pie/donut with tap-to-drill into subcategories
- [ ] Spending-over-time bar/line chart with bucket switcher (day/week/month/year)
- [ ] Income vs. expense chart + net trend
- [ ] Period-vs-period comparison view (e.g. 2023 vs 2024, March vs April)
- [ ] Account balance history chart
- [ ] Every chart segment taps through to the filtered transactions list behind it
- [ ] Global filters (account/category/label) applied across the whole dashboard

## Done when

- "Show me food spending in 2023 vs 2024" takes three taps
- Every number on the dashboard can be tapped through to its underlying transactions
- Nothing Wallet's paywall gated is missing

## Notes

- Read the `dataviz` skill before building the charts (chart form, palette,
  light/dark handling)
- Keep chart components thin wrappers over Recharts so swapping libraries later is cheap
