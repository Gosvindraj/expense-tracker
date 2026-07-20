import type { QueryClient } from "@tanstack/react-query";
import type {
  Category,
  CategoryCreate,
  CategoryUpdate,
  Expense,
  ExpenseCreate,
  ExpenseUpdate,
  ExpenseListResult,
  ImportPreviewRequest,
  ImportCommitRequest,
  ImportPreviewResult,
  ImportCommitResult,
  ImportBatch,
  StatsSummary,
  CategoryStat,
  TimeseriesPoint,
  CompareResult,
  Budget,
  BudgetCreate,
  BudgetUpdate,
  BudgetWithStatus,
  RecurringRule,
  RecurringCreate,
  RecurringUpdate,
} from "../shared/schemas";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    // fetch() throws (rather than resolving with a response) when a request gets
    // blocked before completing — an expired Access session bouncing to login, a
    // stale cached redirect, or a dropped connection all look identical here. The
    // app shell can still load from the PWA's offline cache while this happens,
    // so the symptom is "app loads, no data" with no obvious cause. A reload
    // forces a fresh network round-trip and clears all of the above.
    throw new Error("Couldn't reach the server. Reload the page and try again.");
  }
  if (!res.ok) {
    let msg = `${init?.method ?? "GET"} ${path} failed (${res.status})`;
    try {
      const body = (await res.json()) as {
        error?: string | { issues?: { path?: (string | number)[]; message?: string }[] };
      };
      if (typeof body.error === "string") {
        msg = body.error;
      } else if (body.error && Array.isArray(body.error.issues) && body.error.issues[0]) {
        // zod validation error from the API — surface the first issue readably
        const issue = body.error.issues[0];
        const field = issue.path?.join(".") ?? "";
        msg = field ? `${field}: ${issue.message}` : (issue.message ?? msg);
      }
    } catch {
      /* keep default message */
    }
    throw new Error(msg);
  }
  return res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/**
 * Refetch everything derived from expense rows: the expenses list, the Stats
 * ("stats-*") queries behind the Home screen, and Plan's budget progress.
 * Screens stay mounted across tab switches, so a mutation that only invalidated
 * ["expenses"] left the Home total (and budget status) stale until a manual
 * reload. Every add / edit / delete / import / recurring-run funnels through
 * here so those views refresh on their own.
 */
export function invalidateExpenseData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["expenses"] });
  qc.invalidateQueries({ queryKey: ["budgets"] });
  qc.invalidateQueries({
    predicate: (q) =>
      typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("stats-"),
  });
}

// ---------- categories ----------

export const getCategories = () => api<Category[]>("/api/categories");
export const getRecentCategoryIds = () => api<number[]>("/api/categories/recent");
export const createCategory = (input: CategoryCreate) =>
  api<Category>("/api/categories", json("POST", input));
export const updateCategory = (id: number, input: CategoryUpdate) =>
  api<Category>(`/api/categories/${id}`, json("PATCH", input));
export const deleteCategory = (id: number) =>
  api<{ ok: true }>(`/api/categories/${id}`, { method: "DELETE" });

// ---------- expenses ----------

export interface ExpenseFilters {
  from?: string;
  to?: string;
  categories?: number[];
  q?: string;
  minMinor?: number;
  maxMinor?: number;
}

export function listExpenses(
  filters: ExpenseFilters,
  limit: number,
  offset: number,
): Promise<ExpenseListResult> {
  const p = new URLSearchParams();
  if (filters.from) p.set("from", filters.from);
  if (filters.to) p.set("to", filters.to);
  if (filters.categories?.length) p.set("categories", filters.categories.join(","));
  if (filters.q) p.set("q", filters.q);
  if (filters.minMinor !== undefined) p.set("minMinor", String(filters.minMinor));
  if (filters.maxMinor !== undefined) p.set("maxMinor", String(filters.maxMinor));
  p.set("limit", String(limit));
  p.set("offset", String(offset));
  return api<ExpenseListResult>(`/api/expenses?${p}`);
}

export const createExpense = (input: ExpenseCreate) =>
  api<Expense>("/api/expenses", json("POST", input));
export const updateExpense = (id: number, input: ExpenseUpdate) =>
  api<Expense>(`/api/expenses/${id}`, json("PATCH", input));
export const deleteExpense = (id: number) =>
  api<{ ok: true }>(`/api/expenses/${id}`, { method: "DELETE" });

// ---------- stats ----------

export interface StatsFilters {
  from?: string;
  to?: string;
  categories?: number[];
}

function statsParams(f: StatsFilters, extra?: Record<string, string>) {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.categories?.length) p.set("categories", f.categories.join(","));
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
  return p;
}

export const getStatsSummary = (f: StatsFilters) =>
  api<StatsSummary>(`/api/stats/summary?${statsParams(f)}`);
export const getStatsByCategory = (f: StatsFilters) =>
  api<CategoryStat[]>(`/api/stats/by-category?${statsParams(f)}`);
export const getStatsTimeseries = (f: StatsFilters, bucket: "day" | "month" | "year") =>
  api<TimeseriesPoint[]>(`/api/stats/timeseries?${statsParams(f, { bucket })}`);
export const getStatsCompare = (
  a: { from: string; to: string },
  b: { from: string; to: string },
  categories?: number[],
) => {
  const p = new URLSearchParams({ fromA: a.from, toA: a.to, fromB: b.from, toB: b.to });
  if (categories?.length) p.set("categories", categories.join(","));
  return api<CompareResult>(`/api/stats/compare?${p}`);
};

// ---------- import ----------

export const importPreview = (input: ImportPreviewRequest) =>
  api<ImportPreviewResult>("/api/import/preview", json("POST", input));
export const importCommit = (input: ImportCommitRequest) =>
  api<ImportCommitResult>("/api/import/commit", json("POST", input));
export const getImportBatches = () => api<ImportBatch[]>("/api/import/batches");
export const deleteImportBatch = (id: number) =>
  api<{ ok: true }>(`/api/import/batches/${id}`, { method: "DELETE" });

// ---------- budgets & recurring ----------

export const getBudgets = () => api<BudgetWithStatus[]>("/api/budgets");
export const createBudget = (input: BudgetCreate) =>
  api<Budget>("/api/budgets", json("POST", input));
export const updateBudget = (id: number, input: BudgetUpdate) =>
  api<Budget>(`/api/budgets/${id}`, json("PATCH", input));
export const deleteBudget = (id: number) =>
  api<{ ok: true }>(`/api/budgets/${id}`, { method: "DELETE" });

export const getRecurring = () => api<RecurringRule[]>("/api/recurring");
export const createRecurring = (input: RecurringCreate) =>
  api<RecurringRule>("/api/recurring", json("POST", input));
export const updateRecurring = (id: number, input: RecurringUpdate) =>
  api<RecurringRule>(`/api/recurring/${id}`, json("PATCH", input));
export const deleteRecurring = (id: number) =>
  api<{ ok: true }>(`/api/recurring/${id}`, { method: "DELETE" });

// ---------- backups ----------

export interface BackupObject {
  key: string;
  size: number;
  uploaded: string;
}

export const getBackups = () => api<BackupObject[]>("/api/backups");
export const runBackupNow = () =>
  api<{ key: string; bytes: number; expenses: number; kept: number }>("/api/backups/run", {
    method: "POST",
  });
