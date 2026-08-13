# Phase 7 — UI hardening

**Goal:** close the gap between the app's screens (strong) and the system around
them (underbuilt). Platform integration, destructive-action safety, and one
consistent design vocabulary — without reversing any Phase 0 locked decision.

Derived from a full UI/code review on 2026-08-14. Sections are ordered by
dependency: 1–4 are foundations later sections build on, 5 unifies the
vocabulary, 6–10 are per-screen, 11 is platform polish.

**Working rule:** finish one section → user verifies in Chrome on the local dev
server → next section. Tick boxes only after the code is written AND typechecks.

**Convention — overlays must not reflow the page behind them.** When a form
moves from inline to a sheet, any content that was gated on its open state has
to be un-gated, or the page visibly shifts as the sheet appears. Caught on
Plan 2026-08-14: the "No budgets yet" empty state was hidden while the add form
was open, which was right when the form was inline and wrong the moment it
became a sheet. Nothing behind a sheet should depend on that sheet being open.

---

## Section 1 — Overlay & navigation shell

Everything else with a sheet in it depends on this. Build the primitive once,
migrate all seven overlays onto it.

- [x] `src/components/Sheet.tsx` — one overlay primitive: backdrop, sheet chrome,
      `role="dialog"` + `aria-modal`, Escape to close, focus trap, focus return
      to the trigger on close, body scroll lock while open
- [x] Nested-sheet safety: only the topmost sheet dims and handles Escape
      (a ConfirmSheet opened inside a modal currently double-dims)
- [x] Migrate `CategoryPicker` to `Sheet`
- [x] Migrate `ConfirmSheet` to `Sheet`
- [x] Migrate `PeriodSheet` (Stats) to `Sheet`
- [x] Migrate `EmojiSheet` (Categories) to `Sheet`
- [x] Migrate `EditCategoryModal` (Categories) to `Sheet`
- [x] Migrate the composer overlay (ExpensesList edit) to `Sheet`
- [x] Tabs push real history entries (`pushState`, not `replaceState`) so Android
      back returns to the previous tab instead of exiting the app
- [x] Back button closes the topmost open sheet before it touches tab history
- [x] `popstate` handler keeps tab state and the URL hash in sync

**Verify in Chrome:** open each sheet → press Escape → it closes. Tab through a
sheet → focus never escapes behind it. Close a sheet → focus returns to the
button that opened it. Scroll over the dimmed backdrop → the page behind does not
move. Switch tabs a few times → browser Back walks them in reverse. Open a sheet
→ Back closes the sheet, not the tab.

---

## Section 2 — Accessibility baseline

- [x] Global `:focus-visible` ring on every interactive element (buttons, chips,
      keypad keys, rows, tab bar) — replaces the blanket `outline: none`
- [x] Tappable `<li>` rows → real `<button>` (ExpensesList rows, Categories rows)
- [x] `aria-label` on every icon-only control (`✎`, `⏸`/`▶`, `⌫`, filter chips'
      `✕`, colour dots)
- [x] Raise `--text-3` to clear 4.5:1 on `--bg` (currently ~3:1)
- [x] `@media (prefers-reduced-motion: reduce)` — disable `sheet-up`, bar height
      transitions, and button press `scale()`
- [x] Screen-reader text for emoji-as-icon (category icons announce the name)
- [x] **Touch targets** — the mobile counterpart to focus rings. Measured against
      Android's 48dp: `.bucket-switch button` ~25px, `.color-dots .dot` ~27px,
      `.small-btn` ~27px, `.cat-chip.small` ~27px, `.fchip` ~28px, `.cat-chip`
      ~32px, `.icon-act` ~37px, `.emoji-cell` ~40px. Expand hit areas without
      changing the painted size where neighbours are tight
- [x] Chart: accessible series summary + keyboard-reachable bars. Deferred at
      the time as "zero value on a touch device" — wrong once the device turned
      out to be an iPhone, where **VoiceOver** reads the summary. Keyboard
      stepping is desktop-only value; the summary is the part that matters

**Verify in Chrome:** Tab through Home, List, Add — every stop shows a visible
ring. DevTools → Rendering → "Emulate prefers-reduced-motion" → sheets appear
without sliding. DevTools → Lighthouse → Accessibility score.

---

## Section 3 — Destructive safety & feedback

- [x] Toast system (`src/components/Toast.tsx` + provider) — bottom, above the
      tab bar, auto-dismiss, stacks
- [x] Undo on expense delete (soft window before the mutation commits)
- [x] `ConfirmSheet` stays open while its mutation is in flight; shows pending
      state and renders the error **inside** the sheet instead of closing first
- [x] Same for budget delete, recurring-rule delete, category delete, batch rollback
- [x] Optimistic updates for expense create/update/delete (TanStack Query is
      already in the stack for exactly this — never wired up)
- [x] Replace the on-button "Saved ✓" flash with a toast so it's visible after scroll
- [x] Loading skeletons for the list and the stat tiles (no layout jump)
- [x] **False empty states** (found during Section 3 verification). Five surfaces
      used `data ?? []` then `.length === 0`, so a loading cache rendered as
      genuinely-empty: Plan budgets ("No budgets yet"), Plan recurring, Stats
      chart and category table ("No data in this range"), Import past batches
      ("None yet"). All now gated on `isLoading` with a placeholder
- [x] Remaining cosmetic skeletons — Compare card, Categories list

### Blast-radius guards — DONE 2026-08-14 (added after a real incident)

Rolling back import batch #3 during verification deleted all 1,505 expenses —
the entire Wallet migration. The feature worked exactly as documented; the
problem is that **the most destructive action in the app looks the least
dangerous**. It's an ordinary "Roll back" button in a plain list, behind a
confirm that reads like every other confirm. Deleting *one* expense now gets a
5-second undo window; deleting 1,505 gets a dialog identical to the one for
deleting an empty budget. That's backwards.

- [x] Scale the guard to the blast radius. Options, cheapest first:
      show what's actually being destroyed in the confirm (row count **plus**
      date range and total amount, not just "1505 expenses"); a distinct
      high-risk sheet styling; type-to-confirm for batches over ~100 rows
- [x] Take an automatic snapshot immediately before any bulk delete, so
      rollback-of-the-rollback is always possible
- [x] Audit for other wide-blast actions with narrow guards (category delete
      cascades? recurring-rule delete? `/api/export` is read-only so it's fine)

**Verify in Chrome:** delete an expense → toast with Undo → tap it → the row
comes back. Try deleting a category that has expenses → the error appears in the
sheet, sheet stays open. DevTools → Network → Slow 3G → save an expense → the row
appears immediately, not after the round-trip.

---

## Section 4 — Network & error resilience

Stays inside the online-only decision — this is about being honest when the
network is gone, not about queueing writes offline.

- [x] **Request timeout** (found 2026-08-14: saving an expense with the network
      down hung on "Saving…" indefinitely). `api()` wraps `fetch` in a
      try/catch, but a request that never settles never throws — it hangs for
      the OS TCP timeout, 30 s to 2 min, with the button stuck pending and no
      way out. Add `AbortSignal.timeout(~10s)` in the wrapper and surface the
      abort as a normal error.
      **This is not the same fix as the offline check below:** `navigator.onLine`
      is true whenever you're attached to *any* network, so a captive portal,
      dead router, or one-bar signal all leave writes enabled and hanging
- [x] Cancel affordance on in-flight writes, so a slow save is escapable even
      before the timeout fires
- [x] Online/offline detection + a persistent banner when offline
- [x] Disable write actions while offline with an explanatory message, instead of
      letting them fail into a raw error string
- [x] React error boundary around each screen so one bad panel can't blank the app
- [x] Sensible TanStack Query retry/`staleTime` config (currently all defaults)
- [x] One consistent error presentation (the same component everywhere, not five
      different `<p className="error">` placements)

### Aborted writes still land — FIXED 2026-08-14, found verifying this section

Testing the new save timeout with a 1 ms deadline produced the error message
**and** a real expense row (id 3028, RM 18.00). Aborting a `fetch` cancels the
client's wait, not the server's work — the POST had already been accepted.

So both new affordances currently lie about non-idempotent writes:
- the timeout says "the server didn't respond" when it may have saved fine
- the Cancel button says "Cancel" but means "stop listening"

At a real 12 s timeout on a weak signal this is a duplicate-expense generator:
user sees an error, retries, ends up with two rows.

- [x] After a create times out or is cancelled, look for the exact payload we
      posted (day + category + amount + second-precision `spentAt`) before
      reporting failure. If it landed, treat it as the success it was. No
      idempotency key needed: we aren't matching a retry against an earlier
      attempt, we know exactly what we sent
- [ ] Optional hardening: idempotency key (UUID per attempt, stored on the row,
      server returns the existing expense on a repeat). Strictly more correct
      than payload matching, but needs a migration — deferred unless the
      reconciliation proves insufficient in practice
- [x] Cancel relabelled "Stop waiting" — it never could cancel the write — and
      it now runs the same reconciliation
- [x] Edit and delete need no equivalent: both already invalidate on failure,
      so they self-correct to the server's truth

**Verify in Chrome:** DevTools → Network → Offline → banner appears, Save is
disabled with a reason. Back Online → banner clears, data refetches.
Then the harder case the banner *doesn't* cover: turn off wifi at the OS level
(so `navigator.onLine` may still read true) and save — it must fail with a clear
error inside the timeout, never hang.

---

## Section 5 — Design system consolidation

- [x] Collapse ~10 button variants into a documented set (primary / secondary /
      quiet / danger / icon) and migrate every call site
- [x] One `<Row>` list primitive replacing `.cat-list` / `.expense-list` /
      `.upcoming-list` / `.sheet-rows` / `.mapping-row`
- [x] Remove every inline `style={{ margin… }}` into the stylesheet
- [x] Replace text glyphs (`⌗ ✕ ✎ ⏸ ▶ ‹ › ▲ ▼`) with the inline SVG icon set
      already used by the tab bar
- [x] Sentence case everywhere (`bucket-switch` currently renders lowercase)
- [x] Consistent heading levels; give Home a screen title like every other screen

### Form controls — native pickers break the design language

Every date/month/select today is a bare native control popping Chrome's own
widget, which matches neither the app's sheets nor the other instances of itself.
7 × `type="date"`, 2 × `type="month"`, 4 × `<select>`, 1 × `type="number"` across
5 files.

**Decided 2026-08-14:** app-styled *trigger* + native picker (`showPicker()`),
not a custom calendar. Fixes the resting state — the inconsistency actually on
screen — for ~2% of a custom picker's cost, and keeps native keyboard entry,
locale handling and screen-reader semantics for free. Custom calendar stays
available as a drop-in upgrade behind the same API (Section 12).

- [x] `<DateField>` — app-styled trigger showing the formatted date, hidden real
      `<input type="date">`, opened via `showPicker()`. Replaces all 7: composer,
      List filter from/to, Stats custom range from/to, recurring next-due and ends
- [x] `<MonthField>` — same pattern for the 2 `type="month"` in Stats Compare
- [x] Consolidate the four date formats now in use (`shortDate` "16 Jul 26",
      `dateLabel` "16 Jul 2026", `fmtDay` "Wed, 16 Jul 2026", and Import's raw
      `2026-07-18 06:17:57`) into one documented set in `lib/format.ts`
- [x] `<SelectField>` — sheet-based picker matching `CategoryField`, replacing
      the 4 raw `<select>` (Stats years, budget period, recurring frequency,
      import category mapping)
- [x] `<Stepper>` for the recurring interval (bare `type="number"` spinner today,
      explained only by an invisible `title` attribute)
- [x] One labelling pattern for all fields — today the composer's date has no
      label, the filter panel inlines `<label>From`, the recurring form stacks them

**Verify in Chrome:** walk all five tabs — buttons of the same importance look
identical, list rows share one rhythm, no stray lowercase labels. Tap every date
field in the app (composer, List filters, Stats custom range, recurring form) —
each opens the same in-app sheet, never Chrome's native picker.

---

## Section 6 — List screen

- [x] Persistent search field at the top with debounced live results (today `q`
      is buried behind Filters → type → Apply)
- [x] Day headers: Today / Yesterday / weekday, and sticky while scrolling
- [x] Infinite scroll on scroll-into-view (replaces "Load more"; the
      `useInfiniteQuery` plumbing already exists)
- [x] Swipe-to-delete on a row
- [x] Long-press multi-select → bulk delete and bulk recategorise
- [x] Badge on rows sourced from a recurring rule. **Import badge dropped by
      user decision 2026-08-14**: ~1,505 of 1,509 rows came from the Wallet
      migration, so it marked nearly every row and carried no signal

**Verify in Chrome:** type in search → results narrow as you type. Scroll to the
bottom → the next page loads without a button. DevTools device toolbar → drag a
row left → delete affordance. Long-press → selection mode.

---

## Section 7 — Home / Stats

- [x] Persist period + category filters to localStorage (survive a restart)
- [x] Derive the year list from actual data instead of the hardcoded `>= 2022`
- [x] Stop resetting chart scroll on every data change — preserve position on a
      bucket switch
- [x] Tooltip: position without the magic `92px` clamp; never cover its own bar
- [x] "Custom range" keeps its ✓ while the inline form is open
- [x] One period-picking idiom (the sheet) in Compare — uses the `MonthField` /
      `SelectField` built in Section 5
- [x] Category share view (donut) alongside the bar table
- [x] Insights strip: biggest expense, top category, "X% vs your 3-month average"

**Verify in Chrome:** set a period → reload the page → it's still set. Switch
day/month/year → the chart doesn't jump to the far right. Narrow the window to
320px → the tooltip stays on screen.

---

## Section 8 — Plan screen

- [x] Budget and recurring forms become sheets, matching every other create flow
- [ ] ~~Weekly budgets + custom cycle start day~~ — **dropped by user decision
      2026-08-14**: calendar-month budgets starting on the 1st are what's
      wanted. Both would need a migration (`period` enum + a `start_day`
      column) and a rewrite of the budget aggregation in worker/plan.ts, where
      a period is currently a substring of the date (`substr(spentAt,1,7)`);
      a custom start day makes it a rolling window instead. Not worth the risk
      to existing budget data for a cycle that isn't needed
- [x] Plain-language recurrence preview ("every 2 months, next 15 Sep")
- [x] Move rule Delete onto the row beside Edit and Pause
- [x] Budget history shows amounts and a trend, not just ✓/✕ chips
- [x] Month-end forecast line on the budget bar (projected vs limit)

**Verify in Chrome:** add a budget → it opens as a sheet. Set a rule to every 2
months → the preview sentence matches. Check a mid-month budget shows a forecast.

---

## Section 9 — Data / Import / Categories

- [x] Promote Categories out of the Data tab (it's a core concept two levels deep)
- [x] Category reordering (drag or up/down); `sortOrder: 999` is hardcoded today
- [ ] ~~Subcategories in the UI~~ — **declined 2026-08-14**: not wanted; would
      ripple into the picker, filters and stats grouping for no current use
- [x] Emoji picker: search + free entry (fixed 60-emoji grid today)
- [x] Custom colour (the `input[type="color"]` style is dead CSS). **21 of 33
      categories currently hold colours outside the 13-dot palette** (from the
      seed/import) — Section 2 made the current colour visible as an extra dot,
      but there's still no way to *choose* an arbitrary colour, so those 21 can
      only ever be changed to a palette value, never back
- [x] Format `importedAt` like every other date in the app
### Backups are a dead end in the UI — raised in priority 2026-08-14

When the batch-#3 rollback wiped the local DB, a complete pre-rollback snapshot
(1,505 expenses, 33 categories) was sitting in R2 the whole time — and nothing
in the app said so. Recovering it took a filesystem search and a CLI script.
The Backups card shows snapshot *age and size*, which reads as a promise of
recoverability the UI doesn't keep.

- [x] List the actual snapshots in the Backups card — date, row count, size —
      not just "last snapshot 4 h ago"
- [ ] ~~In-app restore from a chosen snapshot~~ — **declined 2026-08-14.** A
      "replace the entire database" control browsing distance from everything
      else is the wrong shape for this app; the batch-rollback incident is the
      argument. The CLI script works and is now named in the UI, and snapshots
      can be downloaded, so the path is discoverable without the loaded gun
- [x] Failing that, at minimum: link the README restore runbook from the card
      and name the script, so the path is discoverable under stress
- [x] Download a snapshot as a file from the card
- [x] Export that works in an installed standalone PWA (plain `<a download>` is
      unreliable on iOS)
- [ ] ~~Generic CSV column mapper~~ — **declined 2026-08-14**: Wallet was a
      one-time migration; entry is manual now, so an arbitrary-CSV importer is
      dead weight

**Verify in Chrome:** reorder a category → the Add screen strip reflects it.
Search the emoji picker. Export JSON from the installed PWA.

---

## Section 10 — Composer & entry speed

- [x] Note autocomplete over past notes, auto-selecting that note's usual category
      (the single biggest speed win in the app)
- [x] "Repeat last expense" and saved templates
- [x] `=` key on the keypad; move `⌫` next to the amount, out of the number grid
- [x] Composer scrolls safely on short screens with the keyboard open
- [x] Haptic feedback on save (`navigator.vibrate`)

**Verify in Chrome:** type "Gr" in the note → past "Grab" entries suggest, and
picking one sets the category. DevTools device toolbar at 640px height → the
keypad and note field don't collide.

---

## Section 10a — iOS corrections (added 2026-08-14)

**The target device is an iPhone, not Android.** PLAN.md says "installable on
Android" and Phase 6 verified Android install, so sections 1–10 were built on
that assumption — and two decisions were justified out loud on it.

- [x] **`DateField` / `MonthField` rebuilt.** The input was 1px at `opacity: 0`
      and opened via `showPicker()`, which Safari supports poorly; a
      programmatic click on an invisible input opens nothing on iOS. All seven
      date fields were likely dead on iPhone. The native input now overlays the
      styled row and takes the tap itself, so the platform opens its own picker.
      `showPicker()` is still called opportunistically for desktop Chrome
- [x] **File downloads.** `<a download>` is unreliable in an iOS standalone PWA.
      Now prefers the Web Share API with a `File`, which is iOS's real
      "save this" affordance, falling back to the anchor
- [x] Haptic on save is Android-only; annotated rather than removed, since it is
      optional-chained and correct where supported
- [ ] Verify on the actual iPhone: date fields open a picker, exports save,
      Add to Home Screen still works
- [ ] Reconsider: Android back-button handling (Section 1) has no equivalent in
      an iOS standalone PWA. Not broken — sheets still close via Cancel, the
      backdrop and Escape — but the Back-closes-sheet behaviour is unavailable,
      so sheet dismissal must never depend on it

**Already correct for iOS, checked:** `viewport-fit=cover`, `apple-touch-icon`,
`env(safe-area-inset-*)` in the tab bar, sheets, toasts and the composer.

---

## Section 11 — Platform polish

- [ ] Light theme + `prefers-color-scheme` — **questioned 2026-08-14.** The
      original "hard to read in sunlight" argument is a general-audience one;
      for a single user who chose dark it is speculative. Cost is real: ~2,600
      lines of CSS assume a dark ground (chart gridlines, donut pooled slice,
      `${color}33` icon fills, amber banner, skeleton pulse), plus a permanent
      second obligation on every future component. Build only if sunlight
      legibility is an actual problem in use
- [ ] App lock: PIN or WebAuthn biometric. **Face ID caveat:** works in Safari,
      but support inside an installed PWA is inconsistent and the standalone
      context may not see a credential registered in Safari — test before
      building on it. Value is limited anyway: the app is already behind
      Cloudflare Access, so this only defends against someone holding an
      unlocked phone
- [ ] Push notifications for budget thresholds (PWA supports it)
- [x] Launcher shortcut straight into Add (manifest `shortcuts`). **Inert on
      iOS**, which does not implement manifest shortcuts — kept because it costs
      nothing and is correct on Android/desktop
- [ ] ~~PWA share target~~ — declined: sharing text into an expense tracker
      isn't a flow that exists here

**Verify in Chrome:** DevTools → Rendering → emulate light scheme. Install the
PWA → check the shortcut opens Add.

---

## Section 12 — OPTIONAL: scope reversals (needs an explicit decision)

Each of these **contradicts a locked decision in PLAN.md**. Listed for
completeness; do not start any without confirming the decision changed.

- [ ] Offline write queue — PLAN.md: "Offline: No — online-only, D1 is the single
      source of truth"
- [ ] Accounts / payment methods — dropped: "3.7 years of real data used none"
- [ ] Income & net cashflow — dropped: scope is "expenses only"
- [ ] Tags / labels — dropped: "0 labels" in the real export
- [ ] Multi-currency + FX — locked: "Single currency"
- [ ] Receipt photo attachments — never scoped; R2 is already wired for backups
- [ ] Split / shared expenses — never scoped
- [ ] Full custom in-app date calendar behind the Section 5 `<DateField>` API —
      ~400 LOC + range mode + grid a11y; only if the native popup proves annoying
      in daily use
