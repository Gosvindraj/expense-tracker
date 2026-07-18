import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCategories,
  getBudgets,
  createBudget,
  deleteBudget,
  getRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurring,
} from "../api";
import type { Category, RecurringRule } from "../../shared/schemas";
import { projectOccurrences } from "../../shared/recurrence";
import { parseToMinor } from "../../shared/money";
import { fmtAmount } from "../lib/format";
import { CategoryField } from "../components/CategoryPicker";
import ConfirmSheet from "../components/ConfirmSheet";

const pad = (n: number) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodLabel = (p: string) =>
  p.length === 7 ? `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}` : p;
const dateLabel = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export default function Plan() {
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const cats = (categoriesQuery.data ?? []).filter((c) => !c.archived);
  const catById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])),
    [categoriesQuery.data],
  );

  return (
    <div className="plan-screen">
      <BudgetsSection cats={cats} catById={catById} />
      <RecurringSection cats={cats} catById={catById} />
    </div>
  );
}

// ---------- budgets ----------

function BudgetsSection({
  cats,
  catById,
}: {
  cats: Category[];
  catById: Map<number, Category>;
}) {
  const queryClient = useQueryClient();
  const budgetsQuery = useQuery({ queryKey: ["budgets"], queryFn: getBudgets });
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["budgets"] });

  const deleteMutation = useMutation({
    mutationFn: deleteBudget,
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  const budgets = budgetsQuery.data ?? [];

  return (
    <>
      <div className="card-head">
        <h2>Budgets</h2>
        <button type="button" onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "+ Budget"}
        </button>
      </div>
      {err && <p className="error">{err}</p>}

      {adding && (
        <BudgetForm
          cats={cats}
          onDone={() => {
            setAdding(false);
            invalidate();
          }}
        />
      )}

      {budgets.length === 0 && !adding && (
        <p className="muted">No budgets yet — add one to track monthly category limits.</p>
      )}

      {budgets.map((b) => {
        const cat = b.categoryId !== null ? catById.get(b.categoryId) : null;
        const pct = b.amountMinor > 0 ? (b.spentMinor / b.amountMinor) * 100 : 0;
        const over = b.spentMinor > b.amountMinor;
        return (
          <div className="card budget-card" key={b.id}>
            <div className="budget-head">
              <span className="budget-name">
                {cat ? `${cat.icon} ${cat.name}` : "🌐 Overall"}
                <span className="muted"> · {b.period}</span>
              </span>
              <button
                type="button"
                className="danger small-btn"
                onClick={() => setConfirmId(b.id)}
              >
                Delete
              </button>
            </div>
            <div className="budget-numbers">
              <strong className={over ? "over" : ""}>{fmtAmount(b.spentMinor)}</strong>
              <span className="muted"> of {fmtAmount(b.amountMinor)}</span>
              <span className={`budget-pct ${over ? "over" : ""}`}>
                {over
                  ? `${fmtAmount(b.spentMinor - b.amountMinor)} over`
                  : `${fmtAmount(b.amountMinor - b.spentMinor)} left`}
              </span>
            </div>
            <div className="budget-track">
              <div
                className={`budget-fill ${over ? "over" : pct > 80 ? "close" : ""}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            {b.history.length > 0 && (
              <div className="budget-history">
                {b.history.slice(0, 6).map((h) => {
                  const hOver = h.spentMinor > b.amountMinor;
                  return (
                    <span key={h.period} className={`hist ${hOver ? "over" : "under"}`}>
                      {periodLabel(h.period)} {hOver ? "✕" : "✓"}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {confirmId !== null && (
        <ConfirmSheet
          title="Delete this budget?"
          message="Only the budget is removed — no expenses are touched."
          onConfirm={() => deleteMutation.mutate(confirmId)}
          onClose={() => setConfirmId(null)}
        />
      )}
    </>
  );
}

function BudgetForm({ cats, onDone }: { cats: Category[]; onDone: () => void }) {
  const [categoryId, setCategoryId] = useState<number | null>(null); // null = overall
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [err, setErr] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createBudget,
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const minor = parseToMinor(amount);
    if (minor === null || minor <= 0) return setErr("Amount must be a positive number");
    createMutation.mutate({
      categoryId,
      amountMinor: minor,
      period,
    });
  }

  return (
    <form className="card plan-form" onSubmit={submit}>
      <CategoryField categories={cats} value={categoryId} allowOverall onChange={setCategoryId} />
      <div className="row">
        <input
          placeholder="Amount (RM)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select value={period} onChange={(e) => setPeriod(e.target.value as "monthly" | "yearly")}>
          <option value="monthly">per month</option>
          <option value="yearly">per year</option>
        </select>
      </div>
      {err && <p className="error">{err}</p>}
      <button type="submit" className="primary" disabled={createMutation.isPending}>
        Add budget
      </button>
    </form>
  );
}

// ---------- recurring ----------

function RecurringSection({
  cats,
  catById,
}: {
  cats: Category[];
  catById: Map<number, Category>;
}) {
  const queryClient = useQueryClient();
  const recurringQuery = useQuery({ queryKey: ["recurring"], queryFn: getRecurring });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRuleId, setConfirmRuleId] = useState<number | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["recurring"] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      updateRecurring(id, { active }),
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRecurring,
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  const rules = recurringQuery.data ?? [];

  const upcoming = useMemo(() => {
    const from = todayISO();
    const to = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })();
    return rules
      .flatMap((r) => projectOccurrences(r, from, to).map((date) => ({ date, rule: r })))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 12);
  }, [rules]);

  return (
    <>
      <div className="card-head" style={{ marginTop: "1.25rem" }}>
        <h2>Recurring</h2>
        <button type="button" onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "+ Rule"}
        </button>
      </div>
      {err && <p className="error">{err}</p>}

      {(adding || editing) && (
        <RecurringForm
          cats={cats}
          rule={editing}
          onDone={() => {
            setAdding(false);
            setEditing(null);
            invalidate();
          }}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {rules.length === 0 && !adding && (
        <p className="muted">
          No recurring rules — add rent or subscriptions and they'll be logged automatically.
        </p>
      )}

      <ul className="cat-list">
        {rules.map((r) => {
          const cat = catById.get(r.categoryId);
          const freq =
            r.interval === 1 ? r.frequency : `every ${r.interval} ${r.frequency.replace("ly", "s")}`;
          return (
            <li key={r.id} className={r.active ? "" : "inactive-rule"}>
              <span className="icon" style={{ background: `${cat?.color ?? "#8a8f98"}33` }}>
                {cat?.icon ?? "📦"}
              </span>
              <span className="mid">
                <span>
                  {r.note || cat?.name || "Expense"} · <strong>{fmtAmount(r.amountMinor)}</strong>
                </span>
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  {freq} · next {dateLabel(r.nextDueOn)}
                  {!r.active && " · paused"}
                </span>
              </span>
              <button type="button" className="small-btn" onClick={() => setEditing(r)}>
                Edit
              </button>
              <button
                type="button"
                className="small-btn"
                title={r.active ? "Pause" : "Resume"}
                onClick={() => toggleMutation.mutate({ id: r.id, active: !r.active })}
              >
                {r.active ? "⏸" : "▶"}
              </button>
              <button
                type="button"
                className="danger small-btn"
                onClick={() => setConfirmRuleId(r.id)}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      {confirmRuleId !== null && (
        <ConfirmSheet
          title="Delete this rule?"
          message="Already-logged expenses are kept."
          onConfirm={() => deleteMutation.mutate(confirmRuleId)}
          onClose={() => setConfirmRuleId(null)}
        />
      )}

      {upcoming.length > 0 && (
        <div className="card" style={{ marginTop: "0.75rem" }}>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>Next 30 days</h3>
          <ul className="upcoming-list">
            {upcoming.map(({ date, rule }) => (
              <li key={`${rule.id}-${date}`}>
                <span>{dateLabel(date)}</span>
                <span className="mid">
                  {catById.get(rule.categoryId)?.icon} {rule.note || catById.get(rule.categoryId)?.name}
                </span>
                <span className="amount">{fmtAmount(rule.amountMinor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function RecurringForm({
  cats,
  rule,
  onDone,
  onCancel,
}: {
  cats: Category[];
  rule: RecurringRule | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [categoryId, setCategoryId] = useState<number | null>(rule?.categoryId ?? cats[0]?.id ?? null);
  const [amount, setAmount] = useState(rule ? String(rule.amountMinor / 100) : "");
  const [note, setNote] = useState(rule?.note ?? "");
  const [frequency, setFrequency] = useState<"weekly" | "monthly" | "yearly">(
    rule?.frequency ?? "monthly",
  );
  const [interval, setIntervalN] = useState(String(rule?.interval ?? 1));
  const [nextDueOn, setNextDueOn] = useState(rule?.nextDueOn ?? todayISO());
  const [endOn, setEndOn] = useState(rule?.endOn ?? "");
  const [err, setErr] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => {
      const minor = parseToMinor(amount);
      if (minor === null || minor <= 0) throw new Error("Amount must be a positive number");
      if (categoryId === null) throw new Error("Pick a category");
      const payload = {
        categoryId,
        amountMinor: minor,
        note: note.trim(),
        frequency,
        interval: Math.max(1, Number(interval) || 1),
        nextDueOn,
        endOn: endOn || null,
      };
      return rule ? updateRecurring(rule.id, payload) : createRecurring(payload);
    },
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <form
      className="card plan-form"
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
    >
      <CategoryField categories={cats} value={categoryId} onChange={setCategoryId} />
      <div className="row">
        <input
          placeholder="Amount (RM)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          placeholder="Name / note (e.g. Rent)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
      </div>
      <div className="row">
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as typeof frequency)}
        >
          <option value="weekly">weekly</option>
          <option value="monthly">monthly</option>
          <option value="yearly">yearly</option>
        </select>
        <input
          type="number"
          min={1}
          max={24}
          value={interval}
          onChange={(e) => setIntervalN(e.target.value)}
          title="every N periods"
        />
      </div>
      <div className="row">
        <label>
          First / next due
          <input type="date" value={nextDueOn} onChange={(e) => setNextDueOn(e.target.value)} />
        </label>
        <label>
          Ends (optional)
          <input type="date" value={endOn} onChange={(e) => setEndOn(e.target.value)} />
        </label>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button type="submit" className="primary" disabled={saveMutation.isPending}>
          {rule ? "Save" : "Add rule"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
