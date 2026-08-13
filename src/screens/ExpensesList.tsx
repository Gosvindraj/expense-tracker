import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCategories,
  listExpenses,
  deleteExpense,
  updateExpense,
  invalidateExpenseData,
  type ExpenseFilters,
} from "../api";
import type { Category, Expense } from "../../shared/schemas";
import { parseToMinor } from "../../shared/money";
import { fmtAmount, fmtDayHeading, fmtDateShort } from "../lib/format";
import { deleteExpenseWithUndo } from "../lib/expenseCache";
import Icon from "../components/Icon";
import { DateField } from "../components/Field";
import ExpenseComposer from "../components/ExpenseComposer";
import ExpenseRow from "../components/ExpenseRow";
import CategoryPicker from "../components/CategoryPicker";
import ConfirmSheet from "../components/ConfirmSheet";
import Sheet from "../components/Sheet";
import ErrorNote from "../components/ErrorNote";
import { useToast } from "../components/Toast";

const PAGE = 50;

const shortDate = fmtDateShort;

/** Human chips for every active filter, each with the patch that clears it. */
function filterChips(
  filters: ExpenseFilters,
  catById: Map<number, Category>,
): { key: string; label: string; clear: Partial<ExpenseFilters> }[] {
  const chips = [];
  if (filters.from || filters.to) {
    const label =
      filters.from && filters.to
        ? `${shortDate(filters.from)} – ${shortDate(filters.to)}`
        : filters.from
          ? `from ${shortDate(filters.from)}`
          : `until ${shortDate(filters.to!)}`;
    chips.push({ key: "date", label, clear: { from: undefined, to: undefined } });
  }
  if (filters.categories?.length) {
    const label =
      filters.categories.length <= 2
        ? filters.categories
            .map((id) => {
              const c = catById.get(id);
              return c ? `${c.icon} ${c.name}` : "?";
            })
            .join(", ")
        : `${filters.categories.length} categories`;
    chips.push({ key: "cats", label, clear: { categories: undefined } });
  }
  if (filters.q) chips.push({ key: "q", label: `“${filters.q}”`, clear: { q: undefined } });
  if (filters.minMinor !== undefined || filters.maxMinor !== undefined) {
    const min = filters.minMinor !== undefined ? `RM ${(filters.minMinor / 100).toFixed(2)}` : null;
    const max = filters.maxMinor !== undefined ? `RM ${(filters.maxMinor / 100).toFixed(2)}` : null;
    const label = min && max ? `${min} – ${max}` : min ? `≥ ${min}` : `≤ ${max}`;
    chips.push({ key: "amount", label, clear: { minMinor: undefined, maxMinor: undefined } });
  }
  return chips;
}

export default function ExpensesList({
  filters,
  onFiltersChange,
}: {
  filters: ExpenseFilters;
  onFiltersChange: (f: ExpenseFilters) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const catById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])),
    [categoriesQuery.data],
  );
  const [confirmBulk, setConfirmBulk] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);

  // Search lives at the top of the screen now, not buried behind Filters →
  // type → Apply. Local state drives the input; the committed value lands in
  // `filters.q` after a pause so we aren't refetching on every keystroke.
  const [search, setSearch] = useState(filters.q ?? "");
  useEffect(() => {
    if ((filters.q ?? "") === search.trim()) return;
    const t = setTimeout(
      () => onFiltersChange({ ...filters, q: search.trim() || undefined }),
      350,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  // keep the box in step when filters are cleared from a chip
  useEffect(() => {
    setSearch(filters.q ?? "");
  }, [filters.q]);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCat, setBulkCat] = useState(false);

  const expensesQuery = useInfiniteQuery({
    queryKey: ["expenses", filters],
    queryFn: ({ pageParam }) => listExpenses(filters, PAGE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });

  const items = expensesQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const total = expensesQuery.data?.pages[0]?.total ?? 0;
  const sumMinor = expensesQuery.data?.pages[0]?.sumMinor ?? 0;

  const [editing, setEditing] = useState<Expense | null>(null);

  // group by day for headers
  const groups = useMemo(() => {
    const g: { day: string; items: Expense[] }[] = [];
    for (const e of items) {
      const day = e.spentAt.slice(0, 10);
      const last = g[g.length - 1];
      if (last && last.day === day) last.items.push(e);
      else g.push({ day, items: [e] });
    }
    return g;
  }, [items]);

  const hasFilters = Boolean(
    filters.from || filters.to || filters.categories?.length || filters.q ||
    filters.minMinor !== undefined || filters.maxMinor !== undefined,
  );

  // infinite scroll: fetch when the sentinel below the list comes into view
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && expensesQuery.hasNextPage && !expensesQuery.isFetchingNextPage) {
          expensesQuery.fetchNextPage();
        }
      },
      { rootMargin: "400px" }, // start early so it feels seamless
    );
    io.observe(el);
    return () => io.disconnect();
  }, [expensesQuery.hasNextPage, expensesQuery.isFetchingNextPage, expensesQuery]);

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelecting(false);
      return next;
    });

  const selectedExpenses = items.filter((e) => selected.has(e.id));

  const bulkDelete = useMutation({
    mutationFn: async () => {
      for (const e of selectedExpenses) await deleteExpense(e.id);
    },
    onSuccess: () => {
      invalidateExpenseData(queryClient);
      toast({ message: `Deleted ${selected.size} expense${selected.size === 1 ? "" : "s"}` });
      exitSelection();
      setConfirmBulk(false);
    },
  });

  const bulkRecategorise = useMutation({
    mutationFn: async (categoryId: number) => {
      for (const e of selectedExpenses) await updateExpense(e.id, { categoryId });
    },
    onSuccess: () => {
      invalidateExpenseData(queryClient);
      queryClient.invalidateQueries({ queryKey: ["recent-categories"] });
      toast({ message: `Moved ${selected.size} expense${selected.size === 1 ? "" : "s"}` });
      exitSelection();
      setBulkCat(false);
    },
  });

  return (
    <div className="list-screen">
      <h2>Expenses</h2>
      <header className="list-header">
        <div>
          <div className="list-sum">{fmtAmount(sumMinor)}</div>
          <div className="list-count">
            {total} expense{total === 1 ? "" : "s"}
          </div>
        </div>
        <button type="button" className="filter-toggle" onClick={() => setPanelOpen((o) => !o)}>
          {panelOpen ? "Hide filters" : hasFilters ? "Filters •" : "Filters"}
        </button>
      </header>

      <div className="search-bar">
        <Icon name="search" className="search-icon" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes…"
          aria-label="Search expense notes"
        />
        {search && (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            onClick={() => setSearch("")}
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      {selecting && (
        <div className="select-bar">
          <button type="button" className="quiet" onClick={exitSelection}>
            Cancel
          </button>
          <span className="select-count">{selected.size} selected</span>
          <button
            type="button"
            className="quiet"
            disabled={selected.size === 0}
            onClick={() => setBulkCat(true)}
          >
            Recategorise
          </button>
          <button
            type="button"
            className="danger"
            disabled={selected.size === 0 || bulkDelete.isPending}
            onClick={() => setConfirmBulk(true)}
          >
            Delete
          </button>
        </div>
      )}

      {hasFilters && !panelOpen && (
        <div className="fchips">
          {filterChips(filters, catById).map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="fchip"
              aria-label={`Clear filter: ${chip.label}`}
              onClick={() => onFiltersChange({ ...filters, ...chip.clear })}
            >
              {chip.label} <Icon name="close" className="x" />
            </button>
          ))}
        </div>
      )}

      {panelOpen && (
        <FilterPanel
          key={JSON.stringify(filters)}
          categories={(categoriesQuery.data ?? []).filter((c) => !c.archived || filters.categories?.includes(c.id))}
          value={filters}
          onApply={onFiltersChange}
        />
      )}

      {expensesQuery.isLoading && (
        <ul className="expense-list" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <span className="row-btn">
                <span className="icon sk" />
                <span className="mid">
                  <span className="sk sk-line sk-w38" />
                  <span className="sk sk-line sk-sub sk-w55" />
                </span>
                <span className="sk sk-line sk-amount" />
              </span>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={expensesQuery.error} onRetry={() => expensesQuery.refetch()} />
      {!expensesQuery.isLoading && items.length === 0 && (
        <p className="muted">{hasFilters ? "Nothing matches these filters." : "No expenses yet."}</p>
      )}

      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="day-header">
            <span>{fmtDayHeading(g.items[0].spentAt)}</span>
            <span>{fmtAmount(g.items.reduce((n, e) => n + e.amountMinor, 0))}</span>
          </h3>
          <ul className="expense-list">
            {g.items.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                category={catById.get(e.categoryId)}
                selecting={selecting}
                selected={selected.has(e.id)}
                onOpen={() => setEditing(e)}
                onToggleSelect={() => toggle(e.id)}
                onStartSelecting={() => setSelecting(true)}
                onDelete={() =>
                  deleteExpenseWithUndo(queryClient, e, toast, `${fmtAmount(e.amountMinor)} expense`)
                }
              />
            ))}
          </ul>
        </section>
      ))}

      {/* infinite scroll sentinel — replaces the old "Load more" button */}
      <div ref={sentinel} className="list-sentinel">
        {expensesQuery.isFetchingNextPage && <span className="muted">Loading more…</span>}
        {!expensesQuery.hasNextPage && items.length > 0 && (
          <span className="muted">All {total} expenses shown</span>
        )}
      </div>

      {confirmBulk && (
        <ConfirmSheet
          title={`Delete ${selected.size} expense${selected.size === 1 ? "" : "s"}?`}
          message="This can't be undone."
          details={
            <ul className="destroy-list">
              <li>
                <strong>{selected.size}</strong> expenses
              </li>
              <li>
                totalling{" "}
                <strong>
                  {fmtAmount(selectedExpenses.reduce((n, e) => n + e.amountMinor, 0))}
                </strong>
              </li>
            </ul>
          }
          confirmPhrase={selected.size > 100 ? "DELETE" : undefined}
          pending={bulkDelete.isPending}
          error={bulkDelete.error?.message}
          onConfirm={() => bulkDelete.mutate()}
          onClose={() => {
            bulkDelete.reset();
            setConfirmBulk(false);
          }}
        />
      )}

      {bulkCat && (
        <CategoryPicker
          categories={(categoriesQuery.data ?? []).filter((c) => !c.archived)}
          selectedId={null}
          onSelect={(id) => {
            if (id !== null) bulkRecategorise.mutate(id);
          }}
          onClose={() => setBulkCat(false)}
        />
      )}

      {editing && (
        <Sheet title="Edit expense" variant="full" onClose={() => setEditing(null)}>
          <ExpenseComposer
            key={editing.id}
            expense={editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Sheet>
      )}
    </div>
  );
}

function FilterPanel({
  categories,
  value,
  onApply,
}: {
  categories: Category[];
  value: ExpenseFilters;
  onApply: (f: ExpenseFilters) => void;
}) {
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const [selected, setSelected] = useState<number[]>(value.categories ?? []);
  const [q, setQ] = useState(value.q ?? "");
  const [min, setMin] = useState(value.minMinor !== undefined ? String(value.minMinor / 100) : "");
  const [max, setMax] = useState(value.maxMinor !== undefined ? String(value.maxMinor / 100) : "");
  const [err, setErr] = useState<string | null>(null);

  function toggle(id: number) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const minMinor = min.trim() ? parseToMinor(min) : undefined;
    const maxMinor = max.trim() ? parseToMinor(max) : undefined;
    if (minMinor === null || maxMinor === null) return setErr("Amounts must be numbers");
    setErr(null);
    onApply({
      from: from || undefined,
      to: to || undefined,
      categories: selected.length ? selected : undefined,
      q: q.trim() || undefined,
      minMinor: minMinor ?? undefined,
      maxMinor: maxMinor ?? undefined,
    });
  }

  function clear() {
    setFrom(""); setTo(""); setSelected([]); setQ(""); setMin(""); setMax("");
    setErr(null);
    onApply({});
  }

  return (
    <form className="filter-panel" onSubmit={submit}>
      <div className="row">
        <DateField label="From" value={from} onChange={setFrom} placeholder="Any date" />
        <DateField label="To" value={to} onChange={setTo} placeholder="Any date" />
      </div>
      <div className="filter-cats">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`cat-chip small ${selected.includes(c.id) ? "selected" : ""}`}
            onClick={() => toggle(c.id)}
          >
            {c.icon} {c.name}
          </button>
        ))}
      </div>
      <div className="row">
        <input placeholder="Search note…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="row">
        <input placeholder="Min amount" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} />
        <input placeholder="Max amount" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <ErrorNote error={err} />
      <div className="filter-actions">
        <button type="button" className="quiet" onClick={clear}>Clear</button>
        <button type="submit" className="primary">Apply</button>
      </div>
    </form>
  );
}
