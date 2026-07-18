# Phase 2 — Core tracking

**Goal:** daily expense tracking works end to end. **At the end of this phase I can
stop using Wallet for new entries.**

> Scope simplified 2026-07-18 after confirming against the real export:
> **expenses only** — no accounts, no income, no transfers, no labels, no payee.

## Tasks

### Schema (full)
- [x] Migrations for: `categories` (self-referencing `parent_id`), `expenses`,
      `import_batches`; drop the Phase-1 `accounts` table
      (budgets/recurring wait for Phase 5) — `0001` + `0002`, applied local + remote
- [x] Indexes: `expenses(spent_at)`, `(category_id)`
- [x] Amounts as positive `INTEGER` minor units; shared money helpers in `shared/`

### API
- [x] CRUD for categories (DELETE returns 409 when in use — archive instead)
- [x] CRUD for expenses
- [x] `GET /api/expenses` with the full filter set: date range, categories[],
      note text search, amount min/max, pagination — returns items + total count
      + **sum of the filtered set**
- [x] `GET /api/categories/recent` — usage in last 90 days, drives add-screen order
- [x] Zod schemas in `shared/` for every request/response

### UI
- [x] **Add expense screen**:
      - [x] big numeric keypad (2-decimal, single-dot input rules)
      - [x] recently-used categories surfaced first
      - [x] defaults to now (date editable)
      - [ ] target: < 5 seconds to log a typical expense — *verify on phone*
- [x] **Expenses list** — newest first, day-grouped with day totals, load-more,
      filter panel (all API filters), running total for the filtered set,
      tap to edit/delete in a modal
- [x] **Categories screen** — create, edit, archive/restore, delete-when-unused,
      icon + color
- [x] Cache invalidation via TanStack Query on every mutation
- [x] Mobile-first layout (bottom tab bar, safe-area insets)

### Seed
- [x] Seeded the 33 categories from the real Wallet export (exact names, so Phase 3
      auto-mapping is trivial), with icons + colors — `seed/categories.sql`,
      applied local + remote (`npm run db:seed:local|remote`)

### Verified 2026-07-18 (local API tests)
- create/list/patch/delete expenses, filtered sums, 400 on invalid payload,
  409 on deleting an in-use category, recent-categories ordering — all pass;
  remote deploy re-verified (33 categories, 0 expenses)

## Done when

- I can log a real expense on my phone in under 5 seconds
- Filters on the list screen cover everything Wallet gated (any range, any combination)
- New spending is tracked here, not in Wallet
