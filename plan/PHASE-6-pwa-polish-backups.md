# Phase 6 — PWA polish & backups

**Goal:** the app installs and feels like a native Android app, and the data can
never be lost or held hostage again.

## Tasks

### PWA
- [x] `vite-plugin-pwa`: manifest (standalone, theme #4f6df5), icons 192/512 +
      maskable (generated from an HTML template via headless Chromium),
      **`useCredentials: true`** — critical behind Cloudflare Access, else the
      manifest fetch (cookieless by default) 302s to login and install never offers
- [x] Service worker (generateSW/autoUpdate): precaches the app shell;
      `/api/*` and `/cdn-cgi/*` excluded from navigation fallback — API stays
      network-only by design
- [ ] Verify install flow on Android: home-screen icon, splash, no browser chrome
      ← **user: open the app in Chrome → menu → "Add to home screen / Install"**
- [x] Mobile ergonomics: safe-area insets, decimal/date/month input modes,
      bottom tab bar (done across phases 2–4)

### Backups — DONE 2026-07-18 (verified locally end to end)
- [x] R2 bucket `expense-tracker-backups`, bound as `BACKUPS`
- [x] **Nightly Cron Trigger** `0 20 * * *` UTC (04:00 MYT): all tables → JSON
      snapshot `snapshots/YYYY-MM-DD.json`, last 30 kept, older pruned
- [x] Manual `POST /api/backups/run` + "Back up now" button
- [x] `GET /api/export?format=json|csv` — one-click download from the Data tab
- [x] Data tab shows last-backup key/size/count; warning when > 48 h old or none
- [x] **Restore tested**: `scripts/restore-snapshot.mjs <snap.json> --local|--remote`
      — polluted the local DB, restored from snapshot, verified exact return to
      1,505 rows / RM XX,XXX.XX; runbook in README
- [ ] Verify first production snapshot exists (tap "Back up now" once, or check
      after tonight's cron): 
      `npx wrangler r2 object get expense-tracker-backups/snapshots/<today>.json --file NUL`

### Wrap-up
- [ ] (Optional) custom domain instead of `*.workers.dev`
- [x] README: backups & restore runbook added
- [ ] Uninstall Wallet 🎉

## Done when

- App is installed on the home screen and launches instantly
- A dated snapshot lands in R2 every night, 30 retained
- A restore from snapshot has been performed successfully at least once
