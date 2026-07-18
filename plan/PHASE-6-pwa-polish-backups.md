# Phase 6 — PWA polish & backups

**Goal:** the app installs and feels like a native Android app, and the data can
never be lost or held hostage again.

## Tasks

### PWA
- [ ] `vite-plugin-pwa`: manifest (name, theme colors, display `standalone`),
      full icon set (incl. maskable icons for Android)
- [ ] Service worker: cache the app shell for instant launches
      (API stays network-only — the app is online-only by design)
- [ ] Verify install flow on Android: home-screen icon, splash, no browser chrome
- [ ] Mobile ergonomics pass: thumb-reachable primary actions, safe-area insets,
      input types that trigger the right keyboards
- [ ] Lighthouse PWA audit passes

### Backups (the real safety net — do not skip)
- [ ] Create R2 bucket, bind to the Worker
- [ ] **Nightly Cron Trigger**: dump all tables to a JSON snapshot in R2,
      keep the most recent 30, delete older
- [ ] `GET /api/export` — one-click full export (CSV per table + JSON), downloadable
      from Settings
- [ ] Settings shows last-backup timestamp; surface a warning in the UI if the
      latest backup is > 48 h old
- [ ] **Test a restore once**: write the script/procedure that rebuilds a fresh D1
      from a snapshot, run it against a scratch database, document it in the README

### Wrap-up
- [ ] (Optional) custom domain instead of `*.workers.dev`
- [ ] README: architecture overview, dev/deploy/migrate/restore runbook
- [ ] Uninstall Wallet 🎉

## Done when

- App is installed on the home screen and launches instantly
- A dated snapshot lands in R2 every night, 30 retained
- A restore from snapshot has been performed successfully at least once
