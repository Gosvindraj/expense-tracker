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

## Build notes worth keeping

Extracted from the phase documents before they were deleted (2026-08-14). The
checklists were finished and therefore dead; these are the parts that would
still bite someone later.

- **Data provenance.** The Wallet export `report_2026-07-18_134409.csv` — 1,505
  expenses, Nov 2022 → Jul 2026 — was imported as batch #3. It is gitignored;
  keep a copy somewhere other than this repo.
- **Scope was narrowed against real data, not guessed.** Checking the export
  showed 1 account, 0 income rows, 0 transfers, 0 labels — which is why there
  are no accounts, income, transfers, labels or payees. Re-read that before
  reopening any of them.
- **The importer is permanent, not migration scaffolding.** It stays in the app
  for future CSVs.
- **`recurring_rules` uses typed columns**, not the JSON `template` blob in the
  original sketch — so rules stay queryable in SQL.
- **`useCredentials: true` on the PWA manifest is load-bearing.** Behind
  Cloudflare Access the manifest fetch is cookieless by default, 302s to the
  login page, and installation silently fails. Do not remove it.
- **Nightly R2 snapshot** at `0 20 * * *` UTC (04:00 MYT), last 30 kept.
  Restore is `scripts/restore-snapshot.mjs <file> --local|--remote` — deliberately
  a CLI script rather than a button in the app.
- **Custom domain sequencing.** Add the domain, verify it serves, *then* set
  `workers_dev: false`. Doing both in one deploy took the app offline: the old
  hostname stopped routing before the new one existed.
- **Never write a PATCH schema as `createSchema.partial()`.** Zod's `.partial()`
  makes keys optional, but a field with `.default()` still emits that default
  when the key is absent — and the handlers `.set()` the validated body. A
  partial PATCH therefore wrote defaults over real values: reordering categories
  wiped the icon and colour of eight of them. All four update schemas are now
  written explicitly with `.optional()` and no defaults.
- **Aborting a fetch does not cancel the server's work.** A timed-out or
  cancelled create may still have landed, so the client looks for the exact
  payload it posted before reporting failure. Without that, a timeout invites a
  retry and produces a duplicate.
- **Import rollback is the widest-blast action in the app** — it deleted all
  1,505 imported expenses during testing. It now states what it will destroy,
  demands a typed phrase above 100 rows, and takes a snapshot first.
- **iOS: date inputs must be tappable, not hidden.** An input shrunk to 1px and
  opened via `showPicker()` works in Chrome and does nothing on iOS. The native
  input overlays the styled row and takes the tap itself.
- **iOS: `<a download>` is unreliable in a standalone PWA.** Downloads go through
  the Web Share API with a `File`, falling back to the anchor.
- **Controls are 16px** because iOS zooms the viewport for anything smaller and,
  in standalone, there's no pinch-out to undo it.

## Phases

| Phase | Outcome | Status |
|---|---|---|
| 0 | Wallet data exported and safe | Done |
| 1 | Deployed end-to-end skeleton behind Cloudflare Access | Done |
| 2 | Daily tracking works — quit Wallet for new entries here | Done |
| 3 | 3.5 years of history migrated and verified | Done — 1,505 rows |
| 4 | Unrestricted stats — surpasses Wallet here | Done |
| 5 | Budgets + auto-logged recurring payments | Done |
| 6 | Installed PWA, nightly R2 backups, custom domain | Done |
| 7 | Overlay/nav shell, destructive-action safety, accessibility, one design vocabulary, design tokens, per-screen passes | Done — verified on iPhone 2026-08-14 |

Phase documents were deleted once complete: a finished checklist has no readers.
What was worth keeping from them is in **Build notes** above, and everything not
built — with the reasoning — is in [plan/BACKLOG.md](plan/BACKLOG.md). The full
text remains in git history if it is ever wanted.

The target device is an **iPhone**, not the Android this plan originally
assumed; Phase 7 corrected the decisions that had been made on that basis.

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
