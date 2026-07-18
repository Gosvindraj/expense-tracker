# Phase 2 — Core tracking

**Goal:** daily expense tracking works end to end. **At the end of this phase I can
stop using Wallet for new entries.**

**Estimated effort:** ~1–2 weeks of evenings.

## Tasks

### Schema (full)
- [ ] Migrations for: `accounts`, `categories` (self-referencing `parent_id`),
      `labels`, `transactions`, `transaction_labels`, `import_batches`
      (budgets/recurring wait for Phase 5)
- [ ] Indexes: `transactions(occurred_on)`, `(account_id)`, `(category_id)`
- [ ] Amounts as `INTEGER` minor units throughout; shared money helpers in `shared/`

### API
- [ ] CRUD for accounts, categories (with subcategory nesting), labels
- [ ] CRUD for transactions incl. transfers (`transfer_account_id` counterpart logic)
- [ ] `GET /api/transactions` with the full filter set: date range, accounts[],
      categories[] (including "category + all its subcategories"), labels[], type,
      payee/note text search, amount min/max, pagination
- [ ] Zod schemas in `shared/` for every request/response

### UI
- [ ] **Add transaction screen** — the most-used screen, optimize ruthlessly:
      - [ ] big numeric keypad
      - [ ] recently-used categories surfaced first
      - [ ] defaults: today's date + last-used account
      - [ ] expense / income / transfer toggle
      - [ ] target: < 5 seconds to log a typical expense
- [ ] **Transactions list** — infinite scroll, filter panel (all API filters),
      running totals for the filtered set, tap to edit/delete
- [ ] **Settings: manage accounts / categories / labels** (create, edit, archive,
      reorder, icon + color pickers)
- [ ] Optimistic updates via TanStack Query so entry feels instant
- [ ] Mobile-first layout — this will live on a phone

### Seed
- [ ] Manually create my real accounts and category tree (mirroring Wallet's names —
      this makes Phase 3 auto-mapping trivial)

## Done when

- I can log a real expense on my phone in under 5 seconds
- Filters on the list screen cover everything Wallet gated (any range, any combination)
- New spending is tracked here, not in Wallet
