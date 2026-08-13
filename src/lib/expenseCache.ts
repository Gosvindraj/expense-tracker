import type { QueryClient } from "@tanstack/react-query";
import type { Expense } from "../../shared/schemas";
import { deleteExpense, updateExpense, invalidateExpenseData } from "../api";
import type { ToastSpec } from "../components/Toast";

/** Shape of every `["expenses", filters]` infinite query in the cache. */
type Page = { items: Expense[]; total: number; sumMinor: number };
type ExpensePages = { pages: Page[]; pageParams: unknown[] };

const isExpensePages = (d: unknown): d is ExpensePages =>
  !!d && typeof d === "object" && Array.isArray((d as ExpensePages).pages);

/** Apply a page-level transform to every cached expense list, whatever its filters. */
function patchLists(qc: QueryClient, fn: (page: Page) => Page) {
  qc.setQueriesData({ queryKey: ["expenses"] }, (old: unknown) => {
    if (!isExpensePages(old)) return old;
    return { ...old, pages: old.pages.map(fn) };
  });
}

/** Optimistically apply an edit to a row in every cached list. */
export function patchExpenseInCache(
  qc: QueryClient,
  id: number,
  patch: Pick<Expense, "amountMinor" | "categoryId" | "note" | "spentAt">,
) {
  patchLists(qc, (page) => {
    const idx = page.items.findIndex((e) => e.id === id);
    if (idx === -1) return page;
    const before = page.items[idx];
    const items = [...page.items];
    items[idx] = { ...before, ...patch };
    return {
      ...page,
      items,
      // the header total tracks the filtered set, so keep it honest
      sumMinor: page.sumMinor - before.amountMinor + patch.amountMinor,
    };
  });
}

/** Remove a row from every cached list, adjusting the header count and sum. */
function removeExpenseFromCache(qc: QueryClient, id: number) {
  patchLists(qc, (page) => {
    const hit = page.items.find((e) => e.id === id);
    if (!hit) return page;
    return {
      items: page.items.filter((e) => e.id !== id),
      total: Math.max(0, page.total - 1),
      sumMinor: page.sumMinor - hit.amountMinor,
    };
  });
}

type EditInput = Pick<Expense, "amountMinor" | "categoryId" | "note" | "spentAt">;

/**
 * Save an edit optimistically and let the caller close its sheet immediately.
 *
 * Detached from the component on purpose: the composer unmounts the instant the
 * sheet closes, which would take a `useMutation`'s callbacks with it. Patching
 * the cache is only worth anything if the user can actually see the list while
 * the request is still in flight — which they can't behind a full-screen sheet.
 */
export function saveExpenseEdit(
  qc: QueryClient,
  expense: Expense,
  input: EditInput,
  toast: (t: ToastSpec) => void,
) {
  patchExpenseInCache(qc, expense.id, input);

  updateExpense(expense.id, input)
    .then(() => {
      invalidateExpenseData(qc);
      qc.invalidateQueries({ queryKey: ["recent-categories"] });
      toast({ message: "Expense updated" });
    })
    .catch((err: Error) => {
      // refetch drops the optimistic patch and restores the server's truth
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast({ message: `Couldn't save: ${err.message}`, tone: "error", duration: 6000 });
    });
}

const UNDO_MS = 5000;

/**
 * Delete with an undo window.
 *
 * The row is hidden immediately but the DELETE only fires once the window
 * closes, so Undo is just "cancel the timer and refetch" — the row was never
 * touched server-side. Re-creating a deleted expense instead would silently
 * drop its `importBatchId` / `recurringRuleId`, since the create endpoint
 * doesn't accept them.
 *
 * Failure mode if the app closes mid-window: the delete never happens and the
 * row returns. That's the safe direction for a destructive action.
 */
export function deleteExpenseWithUndo(
  qc: QueryClient,
  expense: Expense,
  toast: (t: ToastSpec) => void,
  label: string,
) {
  removeExpenseFromCache(qc, expense.id);

  let cancelled = false;
  const timer = window.setTimeout(async () => {
    if (cancelled) return;
    try {
      await deleteExpense(expense.id);
    } catch (err) {
      toast({ message: (err as Error).message, tone: "error" });
    }
    invalidateExpenseData(qc);
    qc.invalidateQueries({ queryKey: ["recent-categories"] });
  }, UNDO_MS);

  toast({
    message: `Deleted ${label}`,
    duration: UNDO_MS,
    action: {
      label: "Undo",
      onClick: () => {
        cancelled = true;
        clearTimeout(timer);
        // nothing was deleted server-side — a refetch restores the row
        qc.invalidateQueries({ queryKey: ["expenses"] });
      },
    },
  });
}
