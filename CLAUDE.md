# Working on this repo

Personal single-user expense tracker: React PWA + Hono on Cloudflare Workers,
D1 for data, R2 for nightly snapshots. Live at https://expense.gosvindraj.com
behind Cloudflare Access.

Commands, backup/restore and the schema-change workflow are in
[README.md](README.md). This file is the things that aren't obvious from the
code and have already cost real time.

---

## Scope is closed, not undecided

These were ruled out **after checking 3.7 years of the owner's real data**
(1 account, 0 income rows, 0 transfers, 0 labels, one currency). Don't propose
them as improvements — they've each been considered and declined:

| Not building | Why |
|---|---|
| Accounts / payment methods | The real export used one account |
| Income, transfers, net cashflow | Expenses only — "money leaving me in general" |
| Tags / labels | Zero labels in 3.7 years of data |
| Multi-currency / FX | Single currency (RM) |
| Offline write queue | Online-only; D1 is the single source of truth |
| Subcategories | `parentId` exists in the schema, deliberately unused |
| Weekly budgets, custom cycle start | Calendar months from the 1st are what's wanted |
| In-app restore button | Restoring is a CLI script on purpose — see below |
| Generic CSV column mapper | Wallet was a one-time migration; entry is manual now |

Full reasoning, plus what *would* be built if asked, is in
[plan/BACKLOG.md](plan/BACKLOG.md).

## The device is an iPhone

Installed as a standalone PWA. Chrome on Windows will pass things iOS won't:

- **Controls must be ≥16px** or iOS zooms the viewport on focus, with no
  pinch-out to undo it in standalone. `--fs-base` is 16px for this reason.
- **A hidden input is not tappable.** `showPicker()` on a 1px `opacity: 0` input
  works in Chrome and does nothing on iOS. `DateField` overlays the real input
  on the styled row so the tap lands on the native control.
- **`<a download>` is unreliable** in a standalone PWA. `downloadFile()` prefers
  the Web Share API with a `File`.
- **No web vibration API**, so `navigator.vibrate` is a no-op. Harmless, kept
  for Android.
- **No back button.** Tabs push history entries and sheets absorb the pop, but
  no sheet may ever *depend* on Back — Cancel, backdrop and Escape must suffice.
- **Manifest `shortcuts` are inert** on iOS.

## Gotchas that have already bitten

- **Never write a PATCH schema as `createSchema.partial()`.** Zod's `.partial()`
  makes keys optional, but a field with `.default()` still emits that default
  when the key is absent — and handlers `.set()` the validated body. A partial
  PATCH therefore writes defaults over real values. This wiped the icon and
  colour of eight categories. All four update schemas are explicit
  `.optional()` with no defaults; keep them that way.
- **Aborting a fetch does not cancel the server's work.** A timed-out or
  cancelled create may still have landed, so `findMatchingExpense()` looks for
  the exact payload before reporting failure. Without it, a timeout invites a
  retry and produces a duplicate.
- **`useCredentials: true` on the PWA manifest is load-bearing.** Behind Access
  the manifest fetch is cookieless by default, 302s to login, and installation
  silently fails.
- **Import rollback deletes every expense in a batch** — it once removed all
  1,505 imported rows during testing. It states what it will destroy, demands a
  typed phrase above 100 rows, and snapshots first. Don't soften that.
- **Custom domain sequencing:** add the domain, verify it serves, *then* set
  `workers_dev: false`. Doing both in one deploy took the app offline.
- **`npm run deploy` ships the working tree**, not what's on GitHub. There is no
  CI. Committing is not deploying and deploying is not committing.
- **Production is behind Access**, so `curl` against it gets a 302. Verify APIs
  against the local dev server.

## Conventions

- **Money is integer minor units everywhere.** Never floats. `shared/money.ts`.
- **Use the design tokens.** Type, weight, spacing, radius, colour and tracking
  are all tokenised in `:root`. No raw `font-size: 0.85rem`, no hardcoded hex —
  the stylesheet was normalised from 35 font sizes and 36 spacing steps, and it
  regresses easily.
- **One overlay primitive.** Everything modal goes through `Sheet` — it owns
  dialog semantics, Escape, focus trap, focus return, scroll lock and back
  handling. Don't hand-roll a backdrop.
- **Overlays must not reflow the page behind them.** When a form becomes a
  sheet, anything gated on its open state has to be un-gated, or the page
  visibly shifts. Caught twice.
- **Never render a placeholder value as though it were real.** `data ?? 0`
  can't tell "loading" from "genuinely zero" — gate on `isLoading` and show a
  skeleton. False empty states and a false `RM 0.00` header both shipped this
  way once.
- **Destructive actions scale their friction to their blast radius.** One
  expense gets an undo toast; 1,505 get a typed confirmation and a snapshot.

## Verifying

- `npm run check` typechecks app and worker; `npm run build` must pass.
- The local dev D1 is separate from production. Test data lives locally; don't
  assume the remote database matches.
- Screens stay mounted across tab switches (`hidden`, not unmounted), so state
  survives navigation — and per-screen error boundaries exist because one bad
  render would otherwise take the tab bar with it.
