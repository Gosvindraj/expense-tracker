# Expense Tracker

Personal single-user expense tracker PWA on Cloudflare (Workers + D1 + React).
See [PLAN.md](PLAN.md) for the full build plan and [plan/](plan/) for per-phase tasks.

**Production:** https://expense.gosvindraj.com

## Stack

- **Frontend:** React 19 + Vite + TypeScript (`src/`)
- **API:** Hono on Cloudflare Workers (`worker/`)
- **Shared:** Zod schemas + money helpers used by both (`shared/`)
- **DB:** Cloudflare D1 (SQLite) via Drizzle ORM
- One Worker serves both the API (`/api/*`) and the built frontend (static assets,
  SPA fallback). The `@cloudflare/vite-plugin` runs the real Worker + a local D1
  inside `vite dev`.

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

The app sits behind **Cloudflare Access** (Zero Trust, free tier), enabled via
Workers & Pages → expense-tracker → Settings → Domains & Routes → ⋯ on the
workers.dev row → Enable Cloudflare Access. Policy allows only my email.
(workers.dev domains don't appear in the Zero Trust self-hosted app dropdown —
the Workers-side toggle is the correct path.)

Consequence: unauthenticated `curl` against production gets a 302 to the Access
login — API verification must run against the local dev server.
