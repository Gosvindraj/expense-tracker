# Expense Tracker

Personal single-user expense tracker PWA on Cloudflare (Workers + D1 + React).
Replaces BudgetBakers Wallet, with 3.5 years of imported history.

[CLAUDE.md](CLAUDE.md) holds the constraints and gotchas worth knowing before
changing anything; [plan/BACKLOG.md](plan/BACKLOG.md) records what deliberately
isn't built, and why.

**Production:** https://expense.gosvindraj.com

## Stack

- **Frontend:** React 19 + Vite + TypeScript (`src/`)
- **API:** Hono on Cloudflare Workers (`worker/`)
- **Shared:** Zod schemas + money helpers used by both (`shared/`)
- **DB:** Cloudflare D1 (SQLite) via Drizzle ORM
- One Worker serves both the API (`/api/*`) and the built frontend (static assets,
  SPA fallback). The `@cloudflare/vite-plugin` runs the real Worker + a local D1
  inside `vite dev`.

## Data model

Expenses only — no accounts, income, transfers or labels. That was confirmed
against 3.7 years of the real export, not assumed.

```sql
categories      (id, name, parent_id NULL,      -- self-reference exists, unused
                 icon, color, archived, sort_order)
expenses        (id, category_id,
                 amount_minor,                   -- positive INTEGER cents
                 note,
                 spent_at,                       -- 'YYYY-MM-DD HH:MM:SS', indexed
                 created_at, updated_at,
                 import_batch_id NULL,           -- traceability for imported rows
                 recurring_rule_id NULL)         -- set when a rule materialised it
budgets         (id, category_id NULL,           -- NULL = overall budget
                 amount_minor, period 'monthly'|'yearly', active)
recurring_rules (id, category_id, amount_minor, note,
                 frequency 'weekly'|'monthly'|'yearly', interval, anchor_day,
                 next_due_on, end_on NULL, active)
import_batches  (id, source, filename, row_count, imported_at)
```

Indexes on `expenses(spent_at)` and `(category_id)`.
**Money is always INTEGER minor units — never floats.**

## Screens

| Tab | Purpose |
|---|---|
| Home | Period picker, KPI tiles, insights, spending chart, category breakdown, period comparison |
| List | Search, filters, infinite scroll, long-press to edit, swipe to delete |
| Add | Calculator keypad, category strip, note autocomplete, repeat-last |
| Plan | Budgets with month-end forecast, recurring rules |
| Data | Categories, CSV import with rollback, backups and export |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 (frontend + worker + local D1) |
| `npm run check` | Typecheck both the app and the worker |
| `npm run build` | Production build to `dist/` |
| `npm run deploy` | Typecheck + build + `wrangler deploy` |
| `npm run db:generate` | Generate SQL migration in `drizzle/` from `worker/db/schema.ts` |
| `npm run db:migrate:local` | Apply migrations to the local dev D1 (`.wrangler/state`) |
| `npm run db:migrate:remote` | Apply migrations to the production D1 |

## Backups & restore

- **Nightly cron** (`0 20 * * *` UTC = 04:00 MYT) snapshots all tables to R2
  (`expense-tracker-backups`, key `snapshots/YYYY-MM-DD.json`, last 30 kept).
- **Manual**: Data tab → "Back up now"; the card warns when the latest snapshot
  is > 48 h old. One-click **Export JSON / CSV** lives there too.
- **Restore** (tested 2026-07-18): grab a snapshot —
  `npx wrangler r2 object get expense-tracker-backups/snapshots/<date>.json --file snap.json`
  (or use an Export JSON download), make sure migrations are applied, then:

  ```
  node scripts/restore-snapshot.mjs snap.json --local   # or --remote
  ```

  This wipes categories/import_batches/expenses and re-inserts everything from
  the snapshot.

## Schema change workflow

1. Edit `worker/db/schema.ts`
2. `npm run db:generate`
3. `npm run db:migrate:local` — dev server picks it up
4. When deploying: `npm run db:migrate:remote` **before** `npm run deploy`

## Auth

The app sits behind **Cloudflare Access** (Zero Trust, free tier) as a
self-hosted application with `expense.gosvindraj.com` as its only destination,
policy allowing one email.

The `*.workers.dev` hostname is disabled (`workers_dev: false`) so there is one
route in, not two. If the custom domain is ever changed: add the new domain,
verify it serves, *then* disable the old one — doing both in one deploy took the
app offline, because the old hostname stopped routing before the new one had
been created.

Consequence: unauthenticated `curl` against production gets a 302 to the Access
login — API verification must run against the local dev server.
