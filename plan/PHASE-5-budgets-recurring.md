# Phase 5 — Budgets & recurring payments

**Goal:** monthly/yearly category budgets with progress tracking, and recurring
transactions (rent, subscriptions) logged automatically.

## Tasks

### Budgets
- [ ] Migration: `budgets` table (`category_id` NULL = overall budget, amount,
      period monthly|yearly, start_month, active)
- [ ] CRUD API + computed `spent` / `remaining` / `percent` for the current period
      (reuses the Phase 4 by-category aggregation)
- [ ] Budgets screen: progress bars per budget, over/under indicators, current
      period at a glance
- [ ] Budget history: how past periods closed (under/over and by how much)

### Recurring
- [ ] Migration: `recurring_rules` (template JSON: account, category, amount, payee,
      note; frequency weekly|monthly|yearly, interval, day_of_month, next_due_on,
      end_on, active)
- [ ] CRUD API for rules
- [ ] **Daily Cloudflare Cron Trigger** that materializes due rules into real
      transactions and advances `next_due_on`
      - [ ] idempotent — re-running the same day must not double-log
      - [ ] month-end handling (rule on the 31st fires on Feb 28/29, etc.)
- [ ] Recurring screen: upcoming planned payments (next 30 days), edit/pause rules
- [ ] Materialized transactions link back to their rule (visible on the transaction)

## Done when

- Rent logs itself on the right day without me touching the app
- Each category budget shows live progress for the current month
- Deactivating a rule stops future materialization without touching past transactions
