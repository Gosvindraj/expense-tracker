# Phase 3 — Import the Wallet history

**Goal:** all ~3.5 years of Wallet data (Nov 2022 → switchover) lives in D1, verified
against Wallet's own numbers. The importer stays in the app permanently — reusable
for future bank-statement CSVs.

**Prerequisite:** Phase 0 export in hand; Phase 2 schema and account/category tree seeded.

## Tasks

### Investigate first (do not skip)
- [ ] Inspect the real Wallet CSV: delimiter, encoding, date format, column set
- [ ] Confirm how transfers are represented (expect two paired rows)
- [ ] Confirm how multiple labels are packed into one cell
- [ ] Decide the transfer-pairing rule (matching date + amount + opposite accounts)

### Importer API
- [ ] `POST /api/import/preview` — parse uploaded CSV, return: detected columns,
      row count, distinct accounts/categories/labels found, proposed mapping onto
      existing entities (auto-match by name), unmatched items, parse errors
- [ ] `POST /api/import/commit` — execute with the user-confirmed mapping:
      - [ ] create missing categories/labels if chosen
      - [ ] pair transfer rows into single transfer transactions
      - [ ] duplicate detection (same date + amount + account) with skip/include choice
      - [ ] tag every row with an `import_batch_id`
- [ ] `DELETE /api/import/batches/:id` — one-click rollback of a bad import

### Importer UI (in Settings)
- [ ] Upload → preview screen: mapping table (Wallet name → my entity, editable),
      warnings for unmatched/duplicate/error rows
- [ ] Commit with progress + result summary (imported / skipped / errors)
- [ ] Import history list with per-batch rollback

### Verification
- [ ] Per-account balances after import match what Wallet showed
- [ ] Row count: imported ≈ CSV rows minus paired transfer rows
- [ ] Spot-check the oldest month (Nov 2022) and a random middle month against
      Wallet screenshots taken before cancelling

## Done when

- Full history is in the app and balances reconcile with Wallet
- A bad import can be rolled back by batch in one click
- Wallet can be uninstalled
