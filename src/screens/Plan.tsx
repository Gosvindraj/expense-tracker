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
  invalidateExpenseData,
} from "../api";
import type { Category, RecurringRule } from "../../shared/schemas";
import { projectOccurrences } from "../../shared/recurrence";
import { parseToMinor } from "../../shared/money";
import { fmtAmount, fmtDate, fmtMonth } from "../lib/format";
import Icon from "../components/Icon";
import { DateField, SelectField, Stepper } from "../components/Field";
import { CategoryField } from "../components/CategoryPicker";
import ConfirmSheet from "../components/ConfirmSheet";
import Sheet from "../components/Sheet";
import { useToast } from "../components/Toast";
import ErrorNote from "../components/ErrorNote";

const pad = (n: number) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const periodLabel = (p: string) => (p.length === 7 ? fmtMonth(p) : p);
const dateLabel = fmtDate;

/**
 * Straight-line projection of where this period lands at the current pace.
 *
 * A bar showing "62% spent" says nothing about whether that's fine — 62% on the
 * 10th is trouble, 62% on the 28th is not. This turns the same number into the
 * question you actually have.
 *
 * Returns null in the first couple of days, where the extrapolation is noise.
 */
function projectPeriod(spentMinor: number, amountMinor: number, period: "monthly" | "yearly") {
  const now = new Date();
  let elapsed: number;
  let total: number;
  let endLabel: string;

  if (period === "monthly") {
    elapsed = now.getDate();
    total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    endLabel = "month end";
  } else {
    const start = new Date(now.getFullYear(), 0, 1);
    elapsed = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
    total = new Date(now.getFullYear(), 11, 31).getDate() === 31 ? (now.getFullYear() % 4 === 0 ? 366 : 365) : 365;
    endLabel = "year end";
  }

  if (elapsed < 3 || spentMinor <= 0 || amountMinor <= 0) return null;

  const projectedMinor = Math.round((spentMinor / elapsed) * total);
  return {
    projectedMinor,
    pct: (projectedMinor / amountMinor) * 100,
    willExceed: projectedMinor > amountMinor,
    endLabel,
  };
}

export default function Plan() {
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const cats = (categoriesQuery.data ?? []).filter((c) => !c.archived);
  const catById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])),
    [categoriesQuery.data],
  );

  return (
    <div className="plan-screen">
      <h2>Plan</h2>
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
  const toast = useToast();
  const budgetsQuery = useQuery({ queryKey: ["budgets"], queryFn: getBudgets });
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["budgets"] });

  const deleteMutation = useMutation({
    mutationFn: deleteBudget,
    onSuccess: () => {
      invalidate();
      setConfirmId(null);
      toast({ message: "Budget deleted" });
    },
  });

  const budgets = budgetsQuery.data ?? [];

  return (
    <>
      <div className="card-head">
        <h3>Budgets</h3>
        <button type="button" className="quiet" onClick={() => setAdding(true)}>
          + Budget
        </button>
      </div>

      {adding && (
        <Sheet title="New budget" onClose={() => setAdding(false)}>
          <h3>New budget</h3>
          <BudgetForm
            cats={cats}
            onCancel={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              invalidate();
            }}
          />
        </Sheet>
      )}

      {/* gate on isLoading, or an empty cache reads as "you have no budgets" */}
      {budgetsQuery.isLoading && <div className="card sk sk-card-lg" />}
      {!budgetsQuery.isLoading && budgets.length === 0 && (
        <p className="muted">No budgets yet — add one to track monthly category limits.</p>
      )}

      {budgets.map((b) => {
        const cat = b.categoryId !== null ? catById.get(b.categoryId) : null;
        const pct = b.amountMinor > 0 ? (b.spentMinor / b.amountMinor) * 100 : 0;
        const over = b.spentMinor > b.amountMinor;
        const forecast = projectPeriod(b.spentMinor, b.amountMinor, b.period);
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
              {forecast && !over && (
                <span
                  className={`budget-forecast ${forecast.willExceed ? "warn" : ""}`}
                  style={{ left: `${Math.min(100, forecast.pct)}%` }}
                  title={`Projected ${fmtAmount(forecast.projectedMinor)} by period end`}
                />
              )}
            </div>

            {forecast && (
              <p className={`budget-projection ${forecast.willExceed ? "warn" : ""}`}>
                {forecast.willExceed
                  ? `On this pace you'll be ${fmtAmount(forecast.projectedMinor - b.amountMinor)} over by ${forecast.endLabel}`
                  : `On track — about ${fmtAmount(forecast.projectedMinor)} by ${forecast.endLabel}`}
              </p>
            )}

            {b.history.length > 0 && (
              <div className="budget-history">
                {b.history.slice(0, 6).map((h) => {
                  const hOver = h.spentMinor > b.amountMinor;
                  return (
                    <span key={h.period} className={`hist ${hOver ? "over" : "under"}`}>
                      <span className="hist-period">{periodLabel(h.period)}</span>
                      <span className="hist-amount">{fmtAmount(h.spentMinor)}</span>
                      <span
                        className="hist-bar"
                        style={{
                          width: `${Math.min(100, b.amountMinor > 0 ? (h.spentMinor / b.amountMinor) * 100 : 0)}%`,
                        }}
                      />
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
          pending={deleteMutation.isPending}
          error={deleteMutation.error?.message}
          onConfirm={() => deleteMutation.mutate(confirmId)}
          onClose={() => {
            deleteMutation.reset();
            setConfirmId(null);
          }}
        />
      )}
    </>
  );
}

function BudgetForm({
  cats,
  onDone,
  onCancel,
}: {
  cats: Category[];
  onDone: () => void;
  onCancel: () => void;
}) {
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
        <SelectField
          title="Budget period"
          value={period}
          options={[
            { value: "monthly", label: "Per month" },
            { value: "yearly", label: "Per year" },
          ]}
          onChange={(v) => setPeriod(v as "monthly" | "yearly")}
        />
      </div>
      <ErrorNote error={err} />
      <div className="sheet-actions">
        <button type="submit" className="primary" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Adding…" : "Add budget"}
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
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
  const toast = useToast();
  const recurringQuery = useQuery({ queryKey: ["recurring"], queryFn: getRecurring });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [menuRule, setMenuRule] = useState<RecurringRule | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRuleId, setConfirmRuleId] = useState<number | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["recurring"] });
    invalidateExpenseData(queryClient);
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      updateRecurring(id, { active }),
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRecurring,
    onSuccess: () => {
      invalidate();
      setConfirmRuleId(null);
      toast({ message: "Rule deleted" });
    },
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
      <div className="card-head section-gap">
        <h3>Recurring</h3>
        <button type="button" className="quiet" onClick={() => setAdding(true)}>
          + Rule
        </button>
      </div>
      <ErrorNote error={err} />

      {(adding || editing) && (
        <Sheet
          title={editing ? "Edit rule" : "New rule"}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        >
          <h3>{editing ? "Edit rule" : "New rule"}</h3>
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
        </Sheet>
      )}

      {!recurringQuery.isLoading && rules.length === 0 && (
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
              {/* tap-to-open, like every other list row in the app — three
                  inline icon buttons ate the row's width and put Delete next
                  to Pause */}
              <button type="button" className="row-btn" onClick={() => setMenuRule(r)}>
                <span
                  className="icon"
                  aria-hidden="true"
                  style={{ background: `${cat?.color ?? "#8a8f98"}33` }}
                >
                  {cat?.icon ?? "📦"}
                </span>
                <span className="mid">
                  <span>
                    {r.note || cat?.name || "Expense"} · <strong>{fmtAmount(r.amountMinor)}</strong>
                    {!r.active && (
                      <span className="row-badge paused-badge">
                        <Icon name="pause" /> Paused
                      </span>
                    )}
                  </span>
                  <span className="muted row-sub">
                    {/* a paused rule has no next date — saying "next 1 Sep" would
                        be a promise it isn't keeping */}
                    {r.active ? `${freq} · next ${dateLabel(r.nextDueOn)}` : `${freq} · not scheduled`}
                  </span>
                </span>
                <Icon name="chevronRight" className="row-chev" />
              </button>
            </li>
          );
        })}
      </ul>

      {menuRule && (
        <Sheet
          title={menuRule.note || catById.get(menuRule.categoryId)?.name || "Rule"}
          className="picker-sheet"
          onClose={() => setMenuRule(null)}
        >
          <h3>
            {menuRule.note || catById.get(menuRule.categoryId)?.name || "Rule"}
            <span className="muted"> · {fmtAmount(menuRule.amountMinor)}</span>
          </h3>
          <div className="sheet-rows">
            <button
              type="button"
              className="sheet-row"
              onClick={() => {
                setEditing(menuRule);
                setMenuRule(null);
              }}
            >
              <span>
                <Icon name="edit" /> Edit rule
              </span>
            </button>
            <button
              type="button"
              className="sheet-row"
              onClick={() => {
                toggleMutation.mutate({ id: menuRule.id, active: !menuRule.active });
                setMenuRule(null);
              }}
            >
              <span>
                <Icon name={menuRule.active ? "pause" : "play"} />{" "}
                {menuRule.active ? "Pause rule" : "Resume rule"}
              </span>
            </button>
            <button
              type="button"
              className="sheet-row danger"
              onClick={() => {
                setConfirmRuleId(menuRule.id);
                setMenuRule(null);
              }}
            >
              <span>
                <Icon name="close" /> Delete rule
              </span>
            </button>
          </div>
        </Sheet>
      )}

      {confirmRuleId !== null && (
        <ConfirmSheet
          title="Delete this rule?"
          message="Already-logged expenses are kept."
          pending={deleteMutation.isPending}
          error={deleteMutation.error?.message}
          onConfirm={() => deleteMutation.mutate(confirmRuleId)}
          onClose={() => {
            deleteMutation.reset();
            setConfirmRuleId(null);
          }}
        />
      )}

      {upcoming.length > 0 && (
        <div className="card card-gap">
          <h3 className="card-title">Next 30 days</h3>
          <ul className="upcoming-list">
            {upcoming.map(({ date, rule }) => (
              <li key={`${rule.id}-${date}`}>
                <span>{dateLabel(date)}</span>
                <span className="mid">
                  <span aria-hidden="true">{catById.get(rule.categoryId)?.icon}</span>{" "}
                  {rule.note || catById.get(rule.categoryId)?.name}
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

  const n = Number(interval) || 1;
  const unit = frequency === "weekly" ? "week" : frequency === "monthly" ? "month" : "year";
  const intervalSuffix = n === 1 ? unit : `${unit}s`;

  /**
   * The controls state the rule in fragments — a frequency, a number, two
   * dates. This says it back as one sentence, so a wrong setting is obvious
   * before saving rather than a month later.
   */
  const preview = [
    n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`,
    nextDueOn ? `, next on ${fmtDate(nextDueOn)}` : "",
    endOn ? `, until ${fmtDate(endOn)}` : "",
  ].join("");

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
        <SelectField
          label="Repeats"
          title="Frequency"
          value={frequency}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly" },
          ]}
          onChange={(v) => setFrequency(v as typeof frequency)}
        />
        <Stepper
          label="Every"
          value={Number(interval) || 1}
          onChange={(n) => setIntervalN(String(n))}
          min={1}
          max={24}
          suffix={intervalSuffix}
        />
      </div>
      <div className="row">
        <DateField label="First / next due" value={nextDueOn} onChange={setNextDueOn} />
        <DateField label="Ends (optional)" value={endOn} onChange={setEndOn} placeholder="Never" />
      </div>
      <p className="rule-preview">{preview}</p>
      <ErrorNote error={err} />
      <div className="row">
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={saveMutation.isPending}>
          {rule ? "Save" : "Add rule"}
        </button>
      </div>
    </form>
  );
}
