# Personal Expense Tracker — Master Plan

Replace BudgetBakers' Wallet with a self-owned expense tracker: single-user React PWA,
online-only, single currency, running entirely on Cloudflare's free tier — with the
features Wallet paywalled (unrestricted filtering & statistics) free forever.

## Locked decisions

| Decision | Choice |
|---|---|
| Platform | PWA (installable web app) |
| Users | Single user (just me) |
| Offline | No — online-only, D1 is the single source of truth |
| Currency | Single currency, amounts stored as integer cents |
| Budget | Cloudflare free tier only ($0/month) |
| Migration | One-time Wallet CSV import via a reusable in-app import tool |
| Scope (confirmed 2026-07-18) | **Expenses only** — no income, no accounts, no transfers. "Just money leaving me in general." The real export confirmed: 1 account, 0 income rows, 0 transfers, 0 labels. |

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript | Familiar, huge ecosystem |
| PWA | `vite-plugin-pwa` | Manifest + service worker, installable on Android |
| API | Hono on Cloudflare Workers | De-facto Workers framework, TypeScript-first |
| Database | Cloudflare D1 (SQLite) | Free tier: 5 GB, 5M row reads/day |
| ORM | Drizzle ORM | First-class D1 support, type-safe, migrations |
| Validation | Zod | One schema shared by client forms and API |
| Data fetching | TanStack Query | Caching + optimistic updates for snappy entry |
| Charts | Recharts | Good-enough charting for the stats dashboard |
| Auth | Cloudflare Access (Zero Trust free) | Edge-level auth, zero auth code to write |
| Backups | R2 (10 GB free) + nightly Cron Trigger | Never be locked out of my own data again |

Architecture: **one Cloudflare Worker** serves both the API and the static frontend
(Workers with static assets). One repo, one deploy.

Repo layout (single package — `@cloudflare/vite-plugin` runs the Worker inside
`vite dev`, so no workspace split is needed):

```
src/      Vite React PWA
worker/   Hono API + cron handlers
shared/   Zod schemas + TypeScript types used by both
drizzle/  generated SQL migrations
```

## Data model

Simplified to expenses-only (scope confirmed against the real export):

```sql
categories      (id, name, parent_id NULL,          -- subcategories via self-reference
                 icon, color, archived, sort_order)
expenses        (id, category_id,
                 amount_minor,                       -- positive INTEGER cents
                 note,
                 spent_at,                           -- 'YYYY-MM-DD HH:MM:SS', indexed
                 created_at, updated_at,
                 import_batch_id NULL)               -- traceability for imported rows
budgets         (id, category_id NULL,               -- NULL = overall budget
                 amount_minor, period 'monthly'|'yearly', start_month, active)
recurring_rules (id, template JSON,                  -- category, amount, note
                 frequency 'weekly'|'monthly'|'yearly', interval, day_of_month,
                 next_due_on, end_on NULL, active)
import_batches  (id, source, filename, row_count, imported_at)
```

Indexes on `expenses(spent_at)`, `(category_id)`.
Money is always `INTEGER` minor units (cents) — never floats.
Dropped from the original design: accounts, transfers, income, labels, payee
(3.7 years of real data used none of them).

## API surface

```
CRUD:    /api/categories
         /api/expenses           (list takes the full filter set:
                                  date range, categories[] incl. subcats,
                                  note text search, amount min/max, pagination;
                                  returns items + count + sum of the filtered set)
Stats:   /api/stats/summary      total + count for any range
         /api/stats/by-category  grouped, any range, drill into subcategories
         /api/stats/timeseries   daily/weekly/monthly/yearly buckets, any range
         /api/stats/compare      two arbitrary periods side by side
Budgets: /api/budgets (+ computed spent/remaining for current period)
Recur:   /api/recurring (+ cron endpoint that materializes due expenses)
Import:  /api/import/preview     parse uploaded CSV, return proposed mapping
         /api/import/commit      execute with chosen mappings, dedupe, batch record
Export:  /api/export             full CSV/JSON dump of everything, one click
```

Every stats endpoint takes arbitrary `from`/`to` — "stats for 2023" is just a
parameter. That's the whole point of this project.

## Screens

1. **Add expense** — most-used screen, optimize ruthlessly. Big numeric keypad,
   recent categories first, defaults to now. Target: < 5 s to log.
2. **Expenses list** — infinite scroll, full filter panel, running total, tap to edit.
3. **Dashboard / stats** — period picker (this month / last month / any year / custom /
   all time), category pie with drill-down, spending-over-time,
   period-vs-period comparison.
4. **Budgets** — per-category progress bars, over/under indicators.
5. **Recurring** — upcoming planned payments, edit rules.
6. **Settings** — categories management, import, export, backup status.

## Phases

| Phase | File | Outcome |
|---|---|---|
| 0 | [plan/PHASE-0-data-rescue.md](plan/PHASE-0-data-rescue.md) | Wallet data exported and safe |
| 1 | [plan/PHASE-1-walking-skeleton.md](plan/PHASE-1-walking-skeleton.md) | Deployed end-to-end skeleton behind auth |
| 2 | [plan/PHASE-2-core-tracking.md](plan/PHASE-2-core-tracking.md) | Daily tracking works — **can quit Wallet here** |
| 3 | [plan/PHASE-3-import.md](plan/PHASE-3-import.md) | 3.5 years of history migrated and verified |
| 4 | [plan/PHASE-4-stats.md](plan/PHASE-4-stats.md) | Unrestricted stats — **surpasses Wallet here** |
| 5 | [plan/PHASE-5-budgets-recurring.md](plan/PHASE-5-budgets-recurring.md) | Budgets + auto-logged recurring payments |
| 6 | [plan/PHASE-6-pwa-polish-backups.md](plan/PHASE-6-pwa-polish-backups.md) | Installed PWA + nightly backups |

Critical path off Wallet: **0 → 1 → 2 → 3**. Phases 4–6 can be reordered freely.

## Costs

| Item | Cost |
|---|---|
| Workers, D1, R2, Cron, Access | $0 (free tiers) |
| Domain (optional — `*.workers.dev` works) | ~$10/yr if wanted |
| Wallet subscription | one month, once, cancelled immediately |

## Risks

- **Wallet CSV quirks** — transfer pairs as two rows, locale-dependent dates, labels
  packed into one cell. Mitigation: inspect the real file before writing the importer;
  preview-before-commit in the import tool.
- **D1 free tier has no point-in-time recovery** beyond its 30-day time-travel window —
  the nightly R2 snapshot (Phase 6) is the real safety net. Don't skip it.
- **Scope creep** — the app is *useful* at end of Phase 2 and a *complete Wallet
  replacement* at Phase 4. Everything after is gravy.
