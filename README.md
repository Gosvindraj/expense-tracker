# Expense Tracker

Personal single-user expense tracker PWA on Cloudflare (Workers + D1 + React).
See [PLAN.md](PLAN.md) for the full build plan and [plan/](plan/) for per-phase tasks.

**Production:** https://expense-tracker.example.workers.dev

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

## Schema change workflow

1. Edit `worker/db/schema.ts`
2. `npm run db:generate`
3. `npm run db:migrate:local` — dev server picks it up
4. When deploying: `npm run db:migrate:remote` **before** `npm run deploy`

## Auth

The app is meant to sit behind **Cloudflare Access** (Zero Trust, free tier):
dashboard → Zero Trust → Access → Applications → add a self-hosted app for
`expense-tracker.example.workers.dev` with a policy allowing only my email.
Until that's enabled, the URL is public — don't put real data in.
