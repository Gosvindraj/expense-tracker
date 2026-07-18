# Phase 1 — Walking skeleton

**Goal:** a deployed, authenticated, end-to-end slice: React app → Hono API → D1 and
back, live on `*.workers.dev`. Deploy on day one — everything after is iteration on
a live app.

**Status: DONE — including Cloudflare Access (enabled 2026-07-18).**
Live at https://expense-tracker.example.workers.dev

> Structural note: instead of npm workspaces, we used the current recommended
> Cloudflare setup — a single package with `@cloudflare/vite-plugin`, so one Vite
> dev server runs the React app **and** the real Worker with a local D1. Layout:
> `src/` (React), `worker/` (Hono API), `shared/` (Zod schemas + money helpers).

## Tasks

### Project setup
- [x] Init git repo
- [x] Project layout: `src/` (Vite React TS), `worker/` (Hono), `shared/` (Zod + types)
- [x] Worker serves built frontend as static assets (SPA fallback) and routes
      `/api/*` to Hono (`run_worker_first`)
- [x] `wrangler.jsonc` with D1 binding; D1 database created
      (`expense-tracker-db`, id `0274df59-a6ae-418e-8ed7-f0af07a5ab28`, region APAC)
- [x] Drizzle ORM + drizzle-kit migrations against D1 (`drizzle/` dir)
- [x] Local dev workflow documented in README (`npm run dev`)

### Proof slice
- [x] `accounts` table via Drizzle migration (`0000_hot_mad_thinker.sql`)
- [x] `GET/POST /api/accounts` in Hono with Zod validation from `shared/`
- [x] Minimal React page that lists and creates accounts via TanStack Query
- [x] Deployed to https://expense-tracker.example.workers.dev — remote
      `/api/health` and `/api/accounts` verified working

### Auth — DONE 2026-07-18
- [x] Enabled Cloudflare Access via **Workers & Pages → expense-tracker → Settings →
      Domains & Routes → ⋯ on the workers.dev row → Enable Cloudflare Access**
      (note: workers.dev domains never appear in the Zero Trust self-hosted app
      dropdown — that lists only owned zones; the Workers-side toggle is the way),
      policy restricted to you@example.com
- [x] Verified: unauthenticated request → 302 to your-team.cloudflareaccess.com
      login; app usable after logging in

## Done when

- [x] Visiting the production URL prompts a Cloudflare Access login, then
  shows the app
- [x] Creating an account row persists in D1 and survives a redeploy
- [x] `README.md` documents dev, migrate, and deploy commands

## Notes

- Skeleton is deliberately minimally styled; Phase 2 brings real UI
- If the Access login flow feels bad on mobile, the fallback is a simple
  password + session-cookie login later (contained change)
