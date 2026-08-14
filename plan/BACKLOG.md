# Backlog

Everything not built, and why. Extracted from Phase 7 when that document was
deleted (2026-08-14) — a finished checklist has no readers, but the reasoning
behind a decision does.

Nothing here is blocking. The app is complete and in daily use.

---

## Open — would build if wanted

- **Idempotency key on expense create.** A UUID per attempt, stored on the row;
  the server returns the existing expense if it sees the key again. Strictly
  more correct than what's there now, which matches on the exact payload
  (day + category + amount + second-precision `spentAt`) after a timeout or a
  cancel. Payload matching closes the same hole without a migration, so this is
  hardening rather than a fix.
- **Push notifications for budget thresholds.** PWAs support it. Useless until
  budgets are actually in use — there were none at the time of writing.
- **App lock (PIN or WebAuthn biometric).** *Face ID caveat:* works in Safari,
  but support inside an installed PWA is inconsistent, and the standalone
  context may not see a credential registered in Safari — test before building
  on it. Value is limited anyway: the app is behind Cloudflare Access, so this
  only defends against someone holding an unlocked phone.
- **Light theme / `prefers-color-scheme`.** Questioned rather than planned. The
  "hard to read in sunlight" argument is a general-audience one; for a single
  user who chose dark it's speculative. The cost is real — the palette is
  tokenised now, but every component would carry a permanent second obligation.
  Build only if sunlight legibility turns out to be an actual problem.
- **Custom in-app date calendar** behind the existing `<DateField>` API.
  ~400 LOC plus range mode and grid accessibility. The current styled trigger
  opens the native picker, which is correct on iOS and costs nothing. Only worth
  it if the native popup proves annoying in daily use.
- **Chart keyboard navigation** already exists; the accessible series summary is
  the part that matters on a phone and is done.

## Declined — with the reason, so they aren't silently reopened

- **Weekly budgets + custom cycle start day** — calendar months from the 1st are
  what's wanted. Would need a `start_day` column and a rewrite of the budget
  aggregation, where a period is currently a substring of the date
  (`substr(spent_at,1,7)`); a custom start day makes it a rolling window.
- **Subcategories** — `parentId` exists in the schema, unused. Would ripple into
  the picker, filters and stats grouping for no current use.
- **In-app restore from a snapshot** — a "replace the entire database" control a
  browse away from everything else is the wrong shape for this app; the import
  rollback incident is the argument. Snapshots can be downloaded from the
  Backups card, and `scripts/restore-snapshot.mjs` does the restore.
- **Generic CSV column mapper** — Wallet was a one-time migration; entry is
  manual now, so an arbitrary-CSV importer is dead weight.
- **PWA share target** — sharing text into an expense tracker isn't a flow that
  exists here.
- **Offline write queue** — contradicts the locked decision: online-only, D1 is
  the single source of truth.
- **Accounts / payment methods, income & cashflow, tags, multi-currency** — all
  dropped against the real export: 1 account, 0 income rows, 0 transfers,
  0 labels, single currency. Re-read that before reopening any of them.
- **Receipt attachments, split/shared expenses** — never scoped.

## Known and accepted

- **Android back-button handling** (tabs push history entries; sheets absorb the
  pop) has no equivalent in an iOS standalone PWA. Not broken — sheets close via
  Cancel, the backdrop and Escape — but no sheet may ever *depend* on Back.
- **No haptic on save** on iOS: there is no web vibration API. The call is
  optional-chained and correct on Android.
- **Manifest `shortcuts`** is inert on iOS, which doesn't implement them.
