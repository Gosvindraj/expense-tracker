# Phase 3 — Import the Wallet history

**Goal:** all ~3.5 years of Wallet data (Nov 2022 → switchover) lives in D1, verified
against Wallet's own numbers. The importer stays in the app permanently — reusable
for future bank-statement CSVs.

**Prerequisite:** Phase 0 export in hand; Phase 2 schema and category tree seeded.

## Tasks

### Investigate first (do not skip)
- [x] Inspect the real Wallet CSV: delimiter, encoding, date format, column set
- [x] Confirm how transfers are represented — **N/A: zero transfer rows in this export**
- [x] Confirm how multiple labels are packed into one cell — **N/A: zero labeled rows**
- [x] Decide the transfer-pairing rule — **N/A**

### Findings from the real export (`report_2026-07-18_134409.csv`, analyzed 2026-07-18)

- 1,505 records, 2022-11-02 → 2026-07-16, **every month present**, zero malformed
  rows, UTF-8 (no BOM), semicolon-delimited, no quoting edge cases in the data
- Columns: account;category;currency;amount;ref_currency_amount;type;payment_type;
  payment_type_local;note;date;gps_*;warranty_in_month;transfer;payee;labels;
  envelope_id;custom_category
- **Single account ("Cash"), single currency (MYR), all rows type=Expenses** —
  no income, no transfers, no labels, no payees, no GPS
- Amounts: all negative decimals (`-23.00`), `amount` always equals
  `ref_currency_amount`; dates `YYYY-MM-DD HH:MM:SS`
- 33 distinct categories, 1:1 with Wallet's `envelope_id`; some near-duplicates
  worth merging at mapping time (e.g. "Health and beauty" vs "Wellness, beauty",
  "Bar, cafe" / "Restaurant, fast-food" vs "Food & Drinks", "Charity, gifts" vs
  "Gifts, joy")
- Total sum: **-XX,XXX.XX MYR** — verify against Wallet's all-time expense total
- Consequence: the importer needs **no transfer pairing and no label unpacking**;
  category mapping (with optional merges) + dedupe is the whole job

### Importer API
- [ ] `POST /api/import/preview` — parse uploaded CSV, return: detected columns,
      row count, distinct accounts/categories/labels found, proposed mapping onto
      existing entities (auto-match by name), unmatched items, parse errors
- [ ] `POST /api/import/commit` — execute with the user-confirmed mapping:
      - [ ] create missing categories if chosen (or map onto an existing one — this
            is where near-duplicate categories get merged)
      - [ ] duplicate detection (same date + amount + category) with skip/include choice
      - [ ] tag every row with an `import_batch_id`
- [ ] `DELETE /api/import/batches/:id` — one-click rollback of a bad import

### Importer UI (in Settings)
- [ ] Upload → preview screen: mapping table (Wallet name → my entity, editable),
      warnings for unmatched/duplicate/error rows
- [ ] Commit with progress + result summary (imported / skipped / errors)
- [ ] Import history list with per-batch rollback

### Verification
- [ ] All-time total after import = **XX,XXX.XX MYR** (confirmed to match Wallet's
      own all-time expense figure)
- [ ] Row count: imported = 1,505 (minus any explicitly skipped duplicates)
- [ ] Spot-check the oldest month (Nov 2022) and a random middle month against
      Wallet screenshots taken before cancelling

## Done when

- Full history is in the app and the total reconciles with Wallet
- A bad import can be rolled back by batch in one click
- Wallet can be uninstalled
