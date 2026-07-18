import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCategories, getRecentCategoryIds, createExpense } from "../api";
import { parseToMinor } from "../../shared/money";
import { CURRENCY, toDatetimeLocal, inputToSpentAt } from "../lib/format";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;

export default function AddExpense() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const recentQuery = useQuery({ queryKey: ["recent-categories"], queryFn: getRecentCategoryIds });

  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(() => toDatetimeLocal(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

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

  const saveMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["recent-categories"] });
      setAmount("");
      setNote("");
      setWhen(toDatetimeLocal(new Date()));
      setError(null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    },
    onError: (e: Error) => setError(e.message),
  });

  function press(key: (typeof KEYS)[number]) {
    setError(null);
    setAmount((prev) => {
      if (key === "⌫") return prev.slice(0, -1);
      if (key === ".") return prev.includes(".") || prev === "" ? prev : prev + ".";
      const [, dec] = prev.split(".");
      if (dec !== undefined && dec.length >= 2) return prev;
      if (prev.replace(".", "").length >= 9) return prev;
      return prev + key;
    });
  }

  function save() {
    const minor = parseToMinor(amount);
    if (minor === null || minor <= 0) return setError("Enter an amount first");
    if (!categoryId) return setError("Pick a category");
    saveMutation.mutate({
      amountMinor: minor,
      categoryId,
      note: note.trim(),
      spentAt: inputToSpentAt(when),
    });
  }

  return (
    <div className="add-screen">
      <div className={`amount-display ${amount ? "" : "empty"}`}>
        <span className="currency">{CURRENCY}</span>
        <span className="value">{amount || "0"}</span>
      </div>

      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} className="key" onClick={() => press(k)} type="button">
            {k}
          </button>
        ))}
      </div>

      <div className="cat-grid">
        {orderedCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`cat-chip ${categoryId === c.id ? "selected" : ""}`}
            style={categoryId === c.id ? { borderColor: c.color, background: `${c.color}22` } : undefined}
            onClick={() => setCategoryId(c.id)}
          >
            <span>{c.icon}</span> {c.name}
          </button>
        ))}
      </div>

      <div className="add-meta">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          maxLength={500}
        />
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </div>

      {error && <p className="error">{error}</p>}

      <button className="save-btn" type="button" onClick={save} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "Saving…" : savedFlash ? "Saved ✓" : "Save expense"}
      </button>
    </div>
  );
}
