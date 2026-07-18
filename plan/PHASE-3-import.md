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
- [x] `POST /api/import/preview` — parses the CSV, returns row count, date range,
      total, distinct categories with proposed mapping (auto-match by name),
      unmatched items, parse errors, duplicate count
- [x] `POST /api/import/commit` — executes with the user-confirmed mapping:
      - [x] create missing categories if chosen (or map onto an existing one — this
            is where near-duplicate categories get merged)
      - [x] duplicate detection (same timestamp + amount) with skip/include choice
      - [x] tags every row with an `import_batch_id`; chunked atomic `db.batch` inserts
- [x] `GET /api/import/batches` + `DELETE /api/import/batches/:id` — one-click rollback

### Importer UI (Import tab)
- [x] Upload → preview card: stats, editable mapping table (defaults: matched by
      name, unmatched → create), duplicate skip/include choice, parse-error block
- [x] Commit with result summary (imported / skipped / created categories)
- [x] Import history list with per-batch rollback

### Verification — done locally 2026-07-18 against the real CSV
- [x] All-time total after import = **RM XX,XXX.XX** — exact match ✓
- [x] Row count: 1,505 imported, 0 errors, all 33 categories auto-matched
- [x] Spot-check: Nov 2022 = 57 rows ✓ (matches pre-import analysis)
- [x] Re-upload flags all 1,505 as duplicates, inserts 0 ✓
- [x] Rollback deletes the batch's expenses and restores cleanly ✓
- [x] **Production import done 2026-07-18**: batch #1, 1,505 rows, RM XX,XXX.XX
      reconciled, Nov 2022 = 57 ✓. (Cloudflare Access enabled later the same day —
      the app and data are now login-gated.)

## Done when

- Full history is in the app and the total reconciles with Wallet
- A bad import can be rolled back by batch in one click
- Wallet can be uninstalled
