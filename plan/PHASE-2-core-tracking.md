# Phase 2 — Core tracking

**Goal:** daily expense tracking works end to end. **At the end of this phase I can
stop using Wallet for new entries.**

> Scope simplified 2026-07-18 after confirming against the real export:
> **expenses only** — no accounts, no income, no transfers, no labels, no payee.

## Tasks

### Schema (full)
- [ ] Migrations for: `categories` (self-referencing `parent_id`), `expenses`,
      `import_batches`; drop the Phase-1 `accounts` table
      (budgets/recurring wait for Phase 5)
- [ ] Indexes: `expenses(spent_at)`, `(category_id)`
- [ ] Amounts as positive `INTEGER` minor units; shared money helpers in `shared/`

### API
- [ ] CRUD for categories (archive instead of delete when in use)
- [ ] CRUD for expenses
- [ ] `GET /api/expenses` with the full filter set: date range, categories[],
      note text search, amount min/max, pagination — returns items + total count
      + **sum of the filtered set**
- [ ] Recently-used categories endpoint (drives the add-screen ordering)
- [ ] Zod schemas in `shared/` for every request/response

### UI
- [ ] **Add expense screen** — the most-used screen, optimize ruthlessly:
      - [ ] big numeric keypad
      - [ ] recently-used categories surfaced first
      - [ ] defaults to now (date editable)
      - [ ] target: < 5 seconds to log a typical expense
- [ ] **Expenses list** — newest first, load-more, filter panel (all API filters),
      running total for the filtered set, tap to edit/delete
- [ ] **Categories screen** — create, edit, archive, icon + color
- [ ] Optimistic updates via TanStack Query so entry feels instant
- [ ] Mobile-first layout — this will live on a phone

### Seed
- [ ] Seed the 33 categories from the real Wallet export (exact names, so Phase 3
      auto-mapping is trivial), with icons + colors

## Done when

- I can log a real expense on my phone in under 5 seconds
- Filters on the list screen cover everything Wallet gated (any range, any combination)
- New spending is tracked here, not in Wallet
