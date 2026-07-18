# Phase 5 — Budgets & recurring payments

**Goal:** monthly/yearly category budgets with progress tracking, and recurring
expenses (rent, subscriptions) logged automatically.

**Status: DONE 2026-07-18.** Lives in the new **Plan** tab (🎯).

> Design deviation from the original sketch: `recurring_rules` uses proper typed
> columns (category_id, amount_minor, note) instead of a template JSON blob —
> simpler and type-safe now that the scope is expenses-only. `anchor_day` keeps
> "the 31st" meaning month-end forever instead of drifting to the 28th after
> February.

## Tasks

### Budgets
- [x] Migration: `budgets` (`category_id` NULL = overall, amount, period
      monthly|yearly, active) — `0003`
- [x] CRUD API; GET computes `spentMinor` for the current period plus a 6-period
      `history`, reusing month/year GROUP BYs
- [x] Budgets UI: per-budget progress bar (blue → amber > 80% → red over),
      spent / limit / remaining-or-over, add & delete
- [x] Budget history: last 6 periods as ✓/✕ chips (under/over)

### Recurring
- [x] Migration: `recurring_rules` (category, amount, note, frequency
      weekly|monthly|yearly, interval, anchor_day, next_due_on, end_on, active)
      + `expenses.recurring_rule_id` for traceability
- [x] CRUD API; deleting a rule keeps its logged expenses (link detached)
- [x] **Daily cron** (shared with the backup trigger, 04:00 MYT): materializes due
      rules into real expenses **before** the nightly snapshot
      - [x] idempotent — each materialization advances `next_due_on`, re-runs no-op
      - [x] catch-up of missed days (worker asleep), capped at 60 occurrences/rule
      - [x] month-end handling: rule on the 31st fires Feb 28, returns to the 31st
            in March (anchor_day) — **tested: Jan 31 → Feb 28 → Mar 31**
      - [x] `end_on` reached → rule auto-deactivates
      - [x] manual `POST /api/recurring/run-due` (+ `?today=` override for tests)
- [x] Plan tab: rules list (edit / pause / resume / delete) + **Next 30 days**
      upcoming view (occurrences projected client-side from shared/recurrence.ts)
- [x] Materialized expenses carry `recurring_rule_id`

### Verified 2026-07-18 (22 checks, local, DB restored to baseline after)
- Budget spent/history exact vs known data (software Jul = RM XX.XX, Jun = RM XXX.XX;
  overall Jul = RM XXX.XX)
- Due-today materialization, idempotent second run, monthly advance
- Weekly catch-up (3 missed occurrences created in one run)
- Month-end clamp with anchor preservation
- endOn deactivation; rule deletion keeps expenses and detaches links
- Screenshot at 390 px mobile viewport — no overflow, 6 tabs fit

## Done when

- [x] Rent/subscriptions log themselves on the right day without touching the app
- [x] Each category budget shows live progress for the current month
- [x] Deactivating a rule stops future materialization without touching past expenses
