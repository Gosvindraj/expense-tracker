import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCategories, getRecentCategoryIds, createExpense } from "../api";
import { CURRENCY } from "../lib/format";
import CategoryPicker from "../components/CategoryPicker";

const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", ".", "0", "⌫", "+"] as const;
const OPS = ["+", "−", "×", "÷"] as const;
type Key = (typeof KEYS)[number];

const STRIP_COUNT = 8;
const pad2 = (n: number) => String(n).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const isOp = (c: string) => (OPS as readonly string[]).includes(c);

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

export default function AddExpense() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const recentQuery = useQuery({ queryKey: ["recent-categories"], queryFn: getRecentCategoryIds });

  const [expr, setExpr] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [whenDate, setWhenDate] = useState(todayISO);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const orderedCategories = useMemo(() => {
    const cats = (categoriesQuery.data ?? []).filter((c) => !c.archived);
    const recent = recentQuery.data ?? [];
    const rank = new Map(recent.map((id, i) => [id, i]));
    return [...cats].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Infinity;
      const rb = rank.has(b.id) ? rank.get(b.id)! : Infinity;
      if (ra !== rb) return ra - rb;
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
    });
  }, [categoriesQuery.data, recentQuery.data]);

  const strip = useMemo(() => {
    const base = orderedCategories.slice(0, STRIP_COUNT);
    if (categoryId !== null && !base.some((c) => c.id === categoryId)) {
      const sel = orderedCategories.find((c) => c.id === categoryId);
      if (sel) return [sel, ...base.slice(0, STRIP_COUNT - 1)];
    }
    return base;
  }, [orderedCategories, categoryId]);

  const saveMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["recent-categories"] });
      setExpr("");
      setNote("");
      setWhenDate(todayISO());
      setCategoryId(null); // fresh pick for every expense
      setError(null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    },
    onError: (e: Error) => setError(e.message),
  });

  function press(key: Key) {
    setError(null);
    setExpr((prev) => {
      if (key === "⌫") return prev.slice(0, -1);
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

  function save() {
    if (resultMinor === null || resultMinor <= 0) return setError("Enter an amount first");
    if (!categoryId) return setError("Pick a category");
    const now = new Date();
    const time =
      whenDate === todayISO()
        ? `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
        : "12:00:00";
    saveMutation.mutate({
      amountMinor: resultMinor,
      categoryId,
      note: note.trim(),
      spentAt: `${whenDate} ${time}`,
    });
  }

  return (
    <div className="add-screen">
      <div className={`amount-display ${expr ? "" : "empty"}`}>
        <span className="currency">{CURRENCY}</span>
        <span className={`value ${expr.length > 11 ? "long" : ""}`}>{expr || "0"}</span>
      </div>
      <div className={`calc-preview ${hasOp && result !== null ? "" : "hidden"}`}>
        = {CURRENCY} {result !== null ? result.toFixed(2) : ""}
      </div>

      <div className="cat-strip">
        <button type="button" className="cat-chip all-btn" onClick={() => setPickerOpen(true)}>
          ⌗ All
        </button>
        {strip.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`cat-chip ${categoryId === c.id ? "selected" : ""}`}
            style={categoryId === c.id ? { borderColor: c.color, background: `${c.color}2e` } : undefined}
            onClick={() => setCategoryId(c.id)}
          >
            <span>{c.icon}</span> {c.name}
          </button>
        ))}
      </div>

      <div className="add-meta row">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          maxLength={500}
        />
        <input
          type="date"
          value={whenDate}
          max={todayISO()}
          onChange={(e) => setWhenDate(e.target.value)}
        />
      </div>

      {error && <p className="error">{error}</p>}

      <div className="keypad calc">
        {KEYS.map((k) => (
          <button
            key={k}
            className={`key ${isOp(k) ? "op" : ""}`}
            onClick={() => press(k)}
            type="button"
          >
            {k}
          </button>
        ))}
      </div>

      <button className="save-btn" type="button" onClick={save} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "Saving…" : savedFlash ? "Saved ✓" : "Save expense"}
      </button>

      {pickerOpen && (
        <CategoryPicker
          categories={orderedCategories}
          selectedId={categoryId}
          onSelect={(id) => {
            if (id !== null) setCategoryId(id);
            setPickerOpen(false);
            setError(null);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
