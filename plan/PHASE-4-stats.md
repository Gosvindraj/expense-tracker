# Phase 4 — Statistics & dashboard

**Goal:** the unrestricted stats Wallet paywalled — any year, any date range, any
grouping. **At the end of this phase the app surpasses Wallet.**

**Prerequisite:** Phase 3 (stats are only interesting with the full history loaded).

## Tasks

### Stats API
Every endpoint takes arbitrary `from` / `to` plus a category filter:

- [x] `GET /api/stats/summary` — total, count, min/max day (client derives daily avg
      and the vs-previous-period delta)
- [x] `GET /api/stats/by-category` — grouped totals, share-of-total percentages
- [x] `GET /api/stats/timeseries` — day/month/year buckets (weekly dropped: little
      value for personal expenses), zero-filled client-side so timelines have no gaps
- [x] `GET /api/stats/compare` — two arbitrary periods side by side, with deltas
- [x] All implemented as SQL GROUP BYs in D1 — no client-side aggregation of raw rows

### Dashboard UI
- [x] Period picker: this month / last month / this year / last year / **any year** /
      custom range / all time — no gates, ever
- [x] Category breakdown as a **table with inline bars** (dataviz skill: >7 classes
      → table, identity via icon+name labels; donut rejected as anti-pattern),
      top 10 + show-all, tap to drill
- [x] Spending-over-time single-hue column chart (hand-rolled SVG, no chart lib):
      bucket switcher day/month/year, per-bar hover tooltip, thin rounded bars,
      hairline grid
- [x] KPI tiles: total (with % delta vs previous equal-length period), count, avg/day
- [x] Period-vs-period comparison: month or year mode, side-by-side tiles + change,
      per-category delta table sorted by biggest movers
- [x] Every bar and category row taps through to the filtered expenses list
- [x] Global category filter applied across the whole dashboard
- [x] Refetch holds previous render at reduced opacity (no skeleton flash)
- [x] Bonus: tabs are deep-linkable (`#stats`, `#list`, …)

### Verified 2026-07-18
- All endpoints cross-checked against CSV-derived ground truth (2023/2024 totals,
  Feb 2025 month bucket, Food & Drinks 2023, compare A/B, year buckets summing to
  RM XX,XXX.XX) — exact matches, locally and on production
- Rendered at 390px mobile viewport via headless Chromium and visually inspected;
  fixed a horizontal-overflow bug (KPI grid min-width + compare-table scroll container)

## Done when

- [x] "Show me food spending in 2023 vs 2024" takes three taps
      (Stats → category filter → compare years)
- [x] Every number on the dashboard can be tapped through to its underlying expenses
- [x] Nothing Wallet's paywall gated is missing

## Notes

- Charts are hand-rolled SVG (~100 lines) following the `dataviz` skill specs —
  no chart library dependency at all
