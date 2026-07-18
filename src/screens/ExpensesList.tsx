import { useMemo, useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getCategories,
  listExpenses,
  updateExpense,
  deleteExpense,
  type ExpenseFilters,
} from "../api";
import type { Category, Expense } from "../../shared/schemas";
import { parseToMinor } from "../../shared/money";
import { fmtAmount, fmtDay, spentAtToInput, inputToSpentAt } from "../lib/format";

const PAGE = 50;

export default function ExpensesList() {
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const catById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])),
    [categoriesQuery.data],
  );

  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [panelOpen, setPanelOpen] = useState(false);

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

  return (
    <div className="list-screen">
      <header className="list-header">
        <div>
          <div className="list-sum">{fmtAmount(sumMinor)}</div>
          <div className="list-count">
            {total} expense{total === 1 ? "" : "s"}
            {hasFilters ? " (filtered)" : ""}
          </div>
        </div>
        <button type="button" className="filter-toggle" onClick={() => setPanelOpen((o) => !o)}>
          {panelOpen ? "Hide filters" : hasFilters ? "Filters •" : "Filters"}
        </button>
      </header>

      {panelOpen && (
        <FilterPanel
          categories={(categoriesQuery.data ?? []).filter((c) => !c.archived || filters.categories?.includes(c.id))}
          value={filters}
          onApply={(f) => setFilters(f)}
        />
      )}

      {expensesQuery.isLoading && <p className="muted">Loading…</p>}
      {expensesQuery.isError && <p className="error">{(expensesQuery.error as Error).message}</p>}
      {!expensesQuery.isLoading && items.length === 0 && (
        <p className="muted">{hasFilters ? "Nothing matches these filters." : "No expenses yet."}</p>
      )}

      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="day-header">
            <span>{fmtDay(g.items[0].spentAt)}</span>
            <span>{fmtAmount(g.items.reduce((n, e) => n + e.amountMinor, 0))}</span>
          </h3>
          <ul className="expense-list">
            {g.items.map((e) => {
              const cat = catById.get(e.categoryId);
              return (
                <li key={e.id} onClick={() => setEditing(e)}>
                  <span className="icon" style={{ background: `${cat?.color ?? "#8a8f98"}33` }}>
                    {cat?.icon ?? "📦"}
                  </span>
                  <span className="mid">
                    <span className="cat-name">{cat?.name ?? "Unknown"}</span>
                    {e.note && <span className="note">{e.note}</span>}
                  </span>
                  <span className="amount">−{fmtAmount(e.amountMinor)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {expensesQuery.hasNextPage && (
        <button
          type="button"
          className="load-more"
          onClick={() => expensesQuery.fetchNextPage()}
          disabled={expensesQuery.isFetchingNextPage}
        >
          {expensesQuery.isFetchingNextPage ? "Loading…" : `Load more (${items.length} of ${total})`}
        </button>
      )}

      {editing && (
        <EditModal
          expense={editing}
          categories={(categoriesQuery.data ?? []).filter((c) => !c.archived || c.id === editing.categoryId)}
          onClose={() => setEditing(null)}
        />
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
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
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
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button type="submit" className="primary">Apply</button>
        <button type="button" onClick={clear}>Clear</button>
      </div>
    </form>
  );
}

function EditModal({
  expense,
  categories,
  onClose,
}: {
  expense: Expense;
  categories: Category[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(expense.amountMinor / 100));
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [note, setNote] = useState(expense.note);
  const [when, setWhen] = useState(spentAtToInput(expense.spentAt));
  const [err, setErr] = useState<string | null>(null);

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["recent-categories"] });
    onClose();
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const minor = parseToMinor(amount);
      if (minor === null || minor <= 0) throw new Error("Amount must be a positive number");
      return updateExpense(expense.id, {
        amountMinor: minor,
        categoryId,
        note: note.trim(),
        spentAt: inputToSpentAt(when),
      });
    },
    onSuccess: done,
    onError: (e: Error) => setErr(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteExpense(expense.id),
    onSuccess: done,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit expense</h3>
        <label>Amount
          <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>Category
          <select value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </label>
        <label>Note
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </label>
        <label>When
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        {err && <p className="error">{err}</p>}
        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (confirm("Delete this expense?")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
