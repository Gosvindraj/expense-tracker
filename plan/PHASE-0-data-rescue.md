# Phase 0 — Rescue the data from Wallet

**Goal:** get every transaction since Nov 2022 out of Wallet and stored safely,
before any coding happens. Independent of all other phases — do it first.

## Tasks

- [ ] Check whether a free trial of Wallet Pro covers the export feature; otherwise
      subscribe for **one month only**
- [ ] **Immediately cancel auto-renewal** after subscribing (before doing anything else)
- [ ] Export **CSV** — all accounts, date range **Nov 2022 → today**
- [ ] Export **XLS** as a second-format backup while access lasts
- [ ] Copy both files to at least two places (PC + cloud drive)
- [ ] Open the CSV and sanity-check: row count looks plausible, oldest rows are from
      Nov 2022, newest are recent, all accounts appear
- [ ] Note anything odd for the Phase 3 importer (delimiter, date format, how
      transfers/labels look)

## What Wallet's CSV typically looks like

Semicolon-separated, with columns like: account, category, currency, amount, type,
payment type, note, date, labels, transfer flag. Known quirks to watch for:

- **Transfers appear as two rows** (one out, one in) that must be paired on import
- **Date format varies by locale**
- **Multiple labels are packed into a single cell** with an internal delimiter

## Done when

- CSV + XLS exports exist in ≥ 2 locations
- Subscription auto-renewal is confirmed cancelled
- The CSV has been eyeballed and its quirks noted
