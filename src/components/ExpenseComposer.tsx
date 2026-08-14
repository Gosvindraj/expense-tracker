import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCategories,
  getRecentCategoryIds,
  listExpenses,
  createExpense,
  findMatchingExpense,
  getNoteSuggestions,
  invalidateExpenseData,
  CancelledError,
  type NoteSuggestion,
} from "../api";
import { useOnline } from "../lib/useOnline";
import type { Expense } from "../../shared/schemas";
import { CURRENCY, fmtAmount } from "../lib/format";
import { deleteExpenseWithUndo, saveExpenseEdit } from "../lib/expenseCache";
import CategoryPicker from "./CategoryPicker";
import { useToast } from "./Toast";
import Icon from "./Icon";
import { DateField } from "./Field";

/**
 * Two blocks side by side, as on a physical calculator: a 3x4 number pad, and
 * an operator column running five tall with "=" at the foot. Keeps ⌫ next to 0
 * where the thumb expects it, and gives "=" a home without stealing a slot.
 */
const NUM_KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"] as const;
const OP_KEYS = ["÷", "×", "−", "+", "="] as const;
const KEYS = [...NUM_KEYS, ...OP_KEYS];
const OPS = ["+", "−", "×", "÷"] as const;
type Key = (typeof KEYS)[number];

/** The operator and backspace glyphs don't read aloud usefully on their own. */
const KEY_LABELS: Record<Key, string> = {
  "7": "7", "8": "8", "9": "9", "4": "4", "5": "5", "6": "6",
  "1": "1", "2": "2", "3": "3", "0": "0", ".": "Decimal point",
  "÷": "Divide", "×": "Multiply", "−": "Subtract", "+": "Add",
  "=": "Equals", "⌫": "Delete last digit",
};

const STRIP_COUNT = 8;
const pad2 = (n: number) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const isOp = (c: string) => (OPS as readonly string[]).includes(c);

/** Minor units back into a keypad expression: 1250 → "12.50", 1200 → "12". */
const minorToExpr = (minor: number) =>
  minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);

/** Evaluate a calculator expression like "12.5+3×2" (×÷ before +−). Returns RM float or null. */
function evaluate(expr: string): number | null {
  let s = expr;
  while (s && isOp(s[s.length - 1])) s = s.slice(0, -1);
  if (!s) return null;
  const tokens = s.split(/([+−×÷])/).filter((t) => t !== "");
  if (tokens.some((t) => !isOp(t) && !/^\d*\.?\d*$/.test(t))) return null;
  const nums: number[] = [];
  const ops: string[] = [];
  for (const t of tokens) {
    if (isOp(t)) ops.push(t);
    else nums.push(Number(t || "0"));
  }
  if (nums.length !== ops.length + 1) return null;
  // pass 1: × ÷
  for (let i = 0; i < ops.length; ) {
    if (ops[i] === "×" || ops[i] === "÷") {
      const r = ops[i] === "×" ? nums[i] * nums[i + 1] : nums[i] / nums[i + 1];
      if (!Number.isFinite(r)) return null;
      nums.splice(i, 2, r);
      ops.splice(i, 1);
    } else i++;
  }
  // pass 2: + −
  let acc = nums[0];
  for (let i = 0; i < ops.length; i++) acc = ops[i] === "+" ? acc + nums[i + 1] : acc - nums[i + 1];
  return Number.isFinite(acc) ? acc : null;
}

/** The number token currently being typed (after the last operator). */
const currentToken = (expr: string) => expr.split(/[+−×÷]/).pop() ?? "";

/**
 * The one expense form: calculator keypad, category strip, note and date.
 * Without `expense` it creates and stays open for the next entry; with one it
 * edits that expense (preserving its time-of-day) and closes via `onDone`.
 */
export default function ExpenseComposer({
  expense,
  onDone,
  onCancel,
}: {
  expense?: Expense;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const editing = expense !== undefined;
  const queryClient = useQueryClient();
  const toast = useToast();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const recentQuery = useQuery({ queryKey: ["recent-categories"], queryFn: getRecentCategoryIds });

  const [expr, setExpr] = useState(() => (expense ? minorToExpr(expense.amountMinor) : ""));
  const [categoryId, setCategoryId] = useState<number | null>(expense?.categoryId ?? null);
  const [note, setNote] = useState(expense?.note ?? "");
  const [whenDate, setWhenDate] = useState(() => expense?.spentAt.slice(0, 10) ?? todayISO());
  const [pickerOpen, setPickerOpen] = useState(false);
  const online = useOnline();
  const abortRef = useRef<AbortController | null>(null);
  const [reconciling, setReconciling] = useState(false);

  // an archived category stays pickable while it's the one on this expense
  const usable = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter((c) => !c.archived || c.id === expense?.categoryId),
    [categoriesQuery.data, expense?.categoryId],
  );

  /**
   * The strip is ranked by recency: it's eight chips you tap without looking,
   * and what you used yesterday beats any manual order for that job.
   */
  const stripOrder = useMemo(() => {
    const recent = recentQuery.data ?? [];
    const rank = new Map(recent.map((id, i) => [id, i]));
    return [...usable].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Infinity;
      const rb = rank.has(b.id) ? rank.get(b.id)! : Infinity;
      if (ra !== rb) return ra - rb;
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });
  }, [usable, recentQuery.data]);

  /**
   * The full picker is for browsing, so it follows the order set on the
   * Categories screen. Recency ranking there just hides your arrangement —
   * with more recent categories than strip slots, it would never show at all.
   */
  const pickerOrder = useMemo(
    () => [...usable].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [usable],
  );

  const catById = useMemo(() => new Map(usable.map((c) => [c.id, c])), [usable]);

  /**
   * Note autocomplete.
   *
   * 20 of this dataset's notes repeat, and the note predicts the category
   * almost perfectly — "YouTube Premium" was category 4 all 22 times. So a
   * suggestion fills in the category too, and the amount when none is typed
   * yet, turning a four-step entry into one tap.
   */
  const [noteFocused, setNoteFocused] = useState(false);
  const [debouncedNote, setDebouncedNote] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedNote(note.trim()), 200);
    return () => clearTimeout(t);
  }, [note]);

  const suggestQuery = useQuery({
    queryKey: ["note-suggestions", debouncedNote],
    queryFn: () => getNoteSuggestions(debouncedNote),
    enabled: noteFocused && debouncedNote.length > 0,
    staleTime: 60_000,
  });

  const suggestions = (suggestQuery.data ?? []).filter(
    (s) => s.note.toLowerCase() !== note.trim().toLowerCase(),
  );
  const showSuggestions = noteFocused && debouncedNote.length > 0 && suggestions.length > 0;

  function applySuggestion(s: NoteSuggestion) {
    setNote(s.note);
    setCategoryId(s.categoryId);
    // never overwrite an amount already being typed
    if (!expr) setExpr(minorToExpr(s.amountMinor));
    setNoteFocused(false);
  }

  /**
   * "Again" — the single most common entry is a repeat of a recent one, and
   * the note suggestions only help once you've started typing. Only shown on a
   * fresh, untouched form so it can't overwrite work in progress.
   */
  const lastQuery = useQuery({
    queryKey: ["last-expense"],
    queryFn: () => listExpenses({}, 1, 0),
    enabled: !editing,
    staleTime: 30_000,
  });
  const last = lastQuery.data?.items[0];
  const pristine = !expr && !note && categoryId === null;

  function repeatLast() {
    if (!last) return;
    setExpr(minorToExpr(last.amountMinor));
    setCategoryId(last.categoryId);
    setNote(last.note);
  }

  const strip = useMemo(() => {
    const base = stripOrder.slice(0, STRIP_COUNT);
    if (categoryId !== null && !base.some((c) => c.id === categoryId)) {
      const sel = stripOrder.find((c) => c.id === categoryId);
      if (sel) return [sel, ...base.slice(0, STRIP_COUNT - 1)];
    }
    return base;
  }, [stripOrder, categoryId]);

  const refresh = () => {
    invalidateExpenseData(queryClient);
    queryClient.invalidateQueries({ queryKey: ["recent-categories"] });
  };

  type SaveInput = {
    amountMinor: number;
    categoryId: number;
    note: string;
    spentAt: string;
  };

  /**
   * Create only. Edits go through `saveExpenseEdit` so the sheet can close
   * immediately; creates wait for the server because a new row can't be placed
   * into a filtered, sorted, paginated cache without reimplementing the
   * server's filter logic here.
   */
  const createMutation = useMutation({
    mutationFn: (input: SaveInput) => {
      abortRef.current = new AbortController();
      return createExpense(input, abortRef.current.signal);
    },
    // We stopped waiting, but the server may have saved anyway. Check for the
    // exact row before calling it a failure — otherwise the user retries and
    // ends up with a duplicate.
    onError: async (e: Error, input: SaveInput) => {
      setReconciling(true);
      // give an in-flight write a moment to finish committing
      await new Promise((r) => setTimeout(r, 1500));
      const landed = await findMatchingExpense(input);
      setReconciling(false);
      if (landed) return onCreated(input, { late: true });
      // a cancel is the user's own doing — don't report it back as a fault
      if (!(e instanceof CancelledError)) {
        toast({ message: e.message, tone: "error", duration: 6000 });
      }
    },
    onSuccess: (_data, input) => onCreated(input),
  });

  /** Shared by the normal path and by a save we only discovered had landed. */
  function onCreated(input: SaveInput, opts?: { late?: boolean }) {
    // Android only — iOS has no web vibration API, so this is a no-op there.
    // Harmless to keep: optional-chained, and correct if the device supports it.
    navigator.vibrate?.(18);
    refresh();
    setExpr("");
    setNote("");
    setWhenDate(todayISO());
    setCategoryId(null); // fresh pick for every expense
    toast({
      message: opts?.late
        ? `Saved ${fmtAmount(input.amountMinor)} — it went through despite the error`
        : `Saved ${fmtAmount(input.amountMinor)}`,
      duration: opts?.late ? 6000 : undefined,
    });
  }

  /** Delete goes through an undo window rather than a confirm dialog. */
  function requestDelete() {
    if (!expense) return;
    const label = `${fmtAmount(expense.amountMinor)} expense`;
    deleteExpenseWithUndo(queryClient, expense, toast, label);
    onDone?.();
  }

  function press(key: Key) {
    setExpr((prev) => {
      if (key === "⌫") return prev.slice(0, -1);
      if (key === "=") {
        const v = evaluate(prev);
        return v !== null && v > 0 ? minorToExpr(Math.round(v * 100)) : prev;
      }
      if (prev.length >= 24) return prev;
      if (isOp(key)) {
        if (!prev || isOp(prev[prev.length - 1])) {
          // replace a trailing operator; ignore as first char
          return prev && isOp(prev[prev.length - 1]) ? prev.slice(0, -1) + key : prev;
        }
        return prev + key;
      }
      const token = currentToken(prev);
      if (key === ".") {
        if (token.includes(".")) return prev;
        return prev + (token === "" ? "0." : ".");
      }
      const [, dec] = token.split(".");
      if (dec !== undefined && dec.length >= 2) return prev;
      if (token.replace(".", "").length >= 9) return prev;
      return prev + key;
    });
  }

  const hasOp = [...expr].some((c) => isOp(c));
  const result = evaluate(expr);
  const resultMinor = result !== null && result > 0 ? Math.round(result * 100) : null;
  // imported rows can carry a future date; never make the current value unpickable
  const maxDate = whenDate > todayISO() ? whenDate : todayISO();

  function save() {
    // Toasted rather than rendered inline: an error line appearing between the
    // note row and the keypad shifts the amount for the same reason the chip
    // did — and a message over the keypad is more visible than one behind it.
    if (resultMinor === null || resultMinor <= 0) {
      return toast({ message: "Enter an amount first", tone: "error" });
    }
    if (!categoryId) return toast({ message: "Pick a category", tone: "error" });
    const now = new Date();
    // editing keeps the original time of day; a new expense is stamped now
    const time = expense
      ? expense.spentAt.slice(11)
      : whenDate === todayISO()
        ? `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
        : "12:00:00";
    const input = {
      amountMinor: resultMinor,
      categoryId,
      note: note.trim(),
      spentAt: `${whenDate} ${time}`,
    };
    if (expense) {
      // patch the cache, close now, let the request finish in the background
      saveExpenseEdit(queryClient, expense, input, toast);
      return onDone?.();
    }
    createMutation.mutate(input);
  }

  return (
    <div className="add-screen">
      {editing && (
        <div className="composer-bar">
          <button type="button" className="quiet" onClick={onCancel}>
            Cancel
          </button>
          <h3>Edit expense</h3>
          <button type="button" className="danger" onClick={requestDelete}>
            Delete
          </button>
        </div>
      )}

      <div className={`amount-display ${expr ? "" : "empty"}`}>
        <span className="currency">{CURRENCY}</span>
        <span className={`value ${expr.length > 11 ? "long" : ""}`}>{expr || "0"}</span>
      </div>
      <div className={`calc-preview ${hasOp && result !== null ? "" : "hidden"}`}>
        = {CURRENCY} {result !== null ? result.toFixed(2) : ""}
      </div>

      {/* Reserved slot, not a conditional row: the amount above is centred in
          flexible space, so a chip that comes and goes drags the number with
          it. The height stays whether or not the chip is there. */}
      {!editing && (
        <div className="assist-row">
          {last && pristine && (
            <button type="button" className="repeat-last" onClick={repeatLast}>
              <Icon name="play" />
              Again: {fmtAmount(last.amountMinor)}
              <span className="muted">
                {" "}
                {catById.get(last.categoryId)?.name ?? ""}
                {last.note ? ` · ${last.note}` : ""}
              </span>
            </button>
          )}
        </div>
      )}

      <div className="cat-strip">
        <button
          type="button"
          className="cat-chip all-btn"
          aria-label="Choose from all categories"
          onClick={() => setPickerOpen(true)}
        >
          <Icon name="grid" /> All
        </button>
        {categoriesQuery.isLoading &&
          Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="sk cat-chip-sk" />
          ))}
        {strip.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`cat-chip ${categoryId === c.id ? "selected" : ""}`}
            aria-pressed={categoryId === c.id}
            style={categoryId === c.id ? { borderColor: c.color, background: `${c.color}2e` } : undefined}
            onClick={() => setCategoryId(c.id)}
          >
            <span aria-hidden="true">{c.icon}</span> {c.name}
          </button>
        ))}
      </div>

      <div className="add-meta row">
        <div className="note-field">
          <input
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteFocused(true);
            }}
            onFocus={() => setNoteFocused(true)}
            // a tap on a suggestion must land before the list unmounts
            onBlur={() => setTimeout(() => setNoteFocused(false), 150)}
            placeholder="Note (optional)"
            maxLength={500}
            aria-label="Note"
            autoComplete="off"
          />
          {showSuggestions && (
            <ul className="note-suggestions">
              {suggestions.map((s) => {
                const cat = catById.get(s.categoryId);
                return (
                  <li key={s.note}>
                    <button type="button" onClick={() => applySuggestion(s)}>
                      <span className="sg-note">{s.note}</span>
                      <span className="sg-meta">
                        <span aria-hidden="true">{cat?.icon ?? "📦"}</span> {cat?.name ?? ""} ·{" "}
                        {fmtAmount(s.amountMinor)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DateField
          value={whenDate}
          max={maxDate}
          onChange={setWhenDate}
          ariaLabel="Date of expense"
        />
      </div>


      <div className="keypad calc">
        <div className="keypad-nums">
          {NUM_KEYS.map((k) => (
            <button
              key={k}
              className="key"
              aria-label={KEY_LABELS[k]}
              onClick={() => press(k)}
              type="button"
            >
              <span aria-hidden="true">{k}</span>
            </button>
          ))}
        </div>
        <div className="keypad-ops">
          {OP_KEYS.map((k) => (
            <button
              key={k}
              className={`key op ${k === "=" ? "eq" : ""}`}
              aria-label={KEY_LABELS[k]}
              onClick={() => press(k)}
              type="button"
            >
              <span aria-hidden="true">{k}</span>
            </button>
          ))}
        </div>
      </div>

      {reconciling ? (
        <button className="save-btn" type="button" disabled>
          Checking whether it saved…
        </button>
      ) : createMutation.isPending ? (
        <div className="save-row">
          <button className="save-btn" type="button" disabled>
            Saving…
          </button>
          <button
            type="button"
            className="quiet save-cancel"
            onClick={() => abortRef.current?.abort()}
            title="Stops waiting — the save may still complete"
          >
            Stop waiting
          </button>
        </div>
      ) : (
        <button className="save-btn" type="button" onClick={save} disabled={!online}>
          {!online
            ? "Offline — can't save"
            : editing
              ? "Save changes"
              : "Save expense"}
        </button>
      )}

      {pickerOpen && (
        <CategoryPicker
          categories={pickerOrder}
          selectedId={categoryId}
          onSelect={(id) => {
            if (id !== null) setCategoryId(id);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

    </div>
  );
}
