# iPhone verification checklist

Phase 7 (sections 1–10) was built and verified in **Chrome on Windows**, against
a plan that said the target was Android. It isn't — it's an iPhone. Chrome will
happily pass things that iOS handles differently, so this list covers only what
a desktop browser **cannot** tell us.

Run it after deploying, with the app **installed to the Home Screen** (Share →
Add to Home Screen), not just in Safari — standalone mode is where most of the
differences live.

Note what fails and roughly what happened; no need to diagnose.

---

## Tier 1 — known risk, most likely to be broken

### Date fields
Rebuilt for iOS on 2026-08-14. Previously the input was 1px wide at
`opacity: 0` and opened via `showPicker()`, which iOS ignores — so these were
probably dead. There are seven:

- [ ] **Add** screen → the date next to the note
- [ ] **List** → Filters → **From**
- [ ] **List** → Filters → **To**
- [ ] **Home** → period button → Custom range → **From**
- [ ] **Home** → period button → Custom range → **To**
- [ ] **Plan** → + Rule → **First / next due**
- [ ] **Plan** → + Rule → **Ends**

*Expected:* tapping the row opens iOS's own date picker. Choosing a date updates
the row text (e.g. "14 Aug 2026").
*If it fails:* nothing happens on tap, or the keyboard appears instead.

### Month + select fields (same mechanism)
- [ ] **Home** → Compare → month mode → both period pickers open a month wheel
- [ ] **Home** → Compare → year mode → both open an in-app sheet
- [ ] **Plan** → + Budget → period picker opens an in-app sheet

### File saving
`<a download>` is unreliable in a standalone PWA; it now prefers the iOS share
sheet.

- [ ] **Data → Backups → Export JSON** → share sheet appears, can Save to Files
- [ ] **Data → Backups → Export CSV** → same
- [ ] **Data → Backups → Snapshots → Download** → same
- [ ] Cancelling the share sheet leaves no error message

---

## Tier 2 — iOS-specific behaviour worth confirming

### Install & chrome
- [ ] Add to Home Screen works; icon looks right
- [ ] Opens with **no Safari UI** (no address bar)
- [ ] Status bar readable against the dark background
- [ ] No white flash on launch
- [ ] Cloudflare Access login completes **inside** the installed app, not by
      bouncing to Safari

### Safe areas (notch / home indicator)
- [ ] Tab bar sits above the home indicator, not under it
- [ ] The **+** button isn't clipped
- [ ] Toasts (delete something to trigger one) clear the home indicator
- [ ] Bottom sheets clear it too
- [ ] Nothing hidden behind the notch in landscape

### Gestures — possible conflicts
- [ ] **Swipe-to-delete** on a List row works (swipe left from the middle of the
      row, not the edge)
- [ ] Starting a swipe near the **left edge** doesn't fight iOS's back gesture
- [ ] **Long-press** a List row enters selection mode — and does *not* trigger
      iOS text selection or a context menu
- [ ] Vertical scrolling still feels normal on rows that support swiping

### Scrolling
- [ ] Sticky day headers stay pinned while scrolling the List
- [ ] Infinite scroll loads more without a button
- [ ] With a sheet open, the page behind **does not** scroll or rubber-band
- [ ] The chart scrolls horizontally without hijacking vertical page scroll

### Keyboard
- [ ] Add screen: focusing **Note** doesn't cover the amount or the Save button
- [ ] Note **autocomplete list** appears above the field and is tappable while
      the keyboard is up
- [ ] Nothing zooms in when a field is focused

---

## Tier 3 — expected differences, confirm they're not annoying

- [ ] **No haptic** on save — iOS has no web vibration API. Expected, not a bug
- [ ] **No back button** to close sheets. Cancel, the backdrop and the sheet's
      own close should always be enough — flag any sheet you can't get out of
- [ ] Colour picker (**Data → Categories → tap one → colour swatch**) — check
      iOS gives a usable colour UI
- [ ] Emoji "paste any emoji" field accepts an emoji from the iOS keyboard
- [ ] Search field's clear (✕) behaves, with no duplicate native one

---

## Tier 4 — general regression sweep on real hardware

Quick pass over what Phase 7 changed, on the device rather than a desktop:

- [ ] Add an expense end to end
- [ ] Note autocomplete: type `you` → pick YouTube Premium → category **and**
      amount fill in
- [ ] "Again" chip repeats the last expense
- [ ] Keypad: `12 + 3` then `=` shows `15`; ⌫ deletes
- [ ] Edit an expense from the List; the row updates immediately on save
- [ ] Delete an expense → **Undo** in the toast brings it back
- [ ] Home: set a period, force-quit the app, reopen — the period persisted
- [ ] Home: insights cards and the Share donut render correctly
- [ ] Plan: add a budget, check the forecast line appears
- [ ] Categories: reorder, and check the `⌗ All` picker reflects the new order
- [ ] Turn on Airplane Mode → offline banner appears, Save is disabled
- [ ] Turn it off → banner clears, data loads

---

## Things that genuinely cannot be checked here

- **Nightly backup cron** — server-side, check the Backups card a day later
- **Budget push alerts** — not built (Section 11, undecided)
- **Light theme** — not built, and questioned as speculative
