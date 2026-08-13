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

/**
 * Default per-request deadline.
 *
 * Without one, `fetch` can hang for the OS TCP timeout — 30 s to 2 min — while
 * the UI sits on "Saving…" with no way out. That's not a hypothetical: a save
 * with the network down did exactly this. The try/catch below never fired,
 * because a request that never settles never throws.
 */
const TIMEOUT_MS = 12_000;
/** Import and backup move real work; they get room to finish. */
export const LONG_TIMEOUT_MS = 90_000;

/** Marker for a user-initiated cancel, so callers can stay quiet about it. */
export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

async function api<T>(
  path: string,
  init?: RequestInit,
  opts?: { timeoutMs?: number },
): Promise<T> {
  const deadline = AbortSignal.timeout(opts?.timeoutMs ?? TIMEOUT_MS);
  // a caller-supplied signal (a Cancel button) races the deadline
  const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline;

  let res: Response;
  try {
    res = await fetch(path, { ...init, signal });
  } catch (err) {
    const name = (err as Error)?.name;
    if (init?.signal?.aborted) throw new CancelledError();
    if (name === "TimeoutError") {
      throw new Error("The server didn't respond in time. Check your connection and try again.");
    }
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

export interface NoteSuggestion {
  note: string;
  n: number;
  categoryId: number;
  amountMinor: number;
}

/** Past notes matching `q`, with the category and amount they last carried. */
export const getNoteSuggestions = (q: string) =>
  api<NoteSuggestion[]>(`/api/expenses/notes?q=${encodeURIComponent(q)}`);

export const createExpense = (input: ExpenseCreate, signal?: AbortSignal) =>
  api<Expense>("/api/expenses", { ...json("POST", input), signal });

/**
 * Did a create that we stopped waiting for actually land?
 *
 * Aborting a fetch — on timeout or via Cancel — ends the client's wait, not the
 * server's work. Reporting a clean failure in that case is a duplicate-expense
 * generator: the user sees an error, retries, and ends up with two rows. So we
 * look for the exact payload we sent before deciding it failed.
 *
 * This works without an idempotency key because we're not matching a retry
 * against an earlier attempt — we know precisely what we posted, down to the
 * second, and only need to know whether that specific row exists.
 */
export async function findMatchingExpense(input: ExpenseCreate): Promise<Expense | null> {
  const day = input.spentAt.slice(0, 10);
  const p = new URLSearchParams({
    from: day,
    to: day,
    categories: String(input.categoryId),
    minMinor: String(input.amountMinor),
    maxMinor: String(input.amountMinor),
    limit: "50",
    offset: "0",
  });
  try {
    const res = await api<ExpenseListResult>(`/api/expenses?${p}`);
    return res.items.find((e) => e.spentAt === input.spentAt) ?? null;
  } catch {
    return null; // still unreachable — fall back to reporting the failure
  }
}
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

// parsing and inserting 1,500 rows takes real time — don't cut these off
export const importPreview = (input: ImportPreviewRequest) =>
  api<ImportPreviewResult>("/api/import/preview", json("POST", input), {
    timeoutMs: LONG_TIMEOUT_MS,
  });
export const importCommit = (input: ImportCommitRequest) =>
  api<ImportCommitResult>("/api/import/commit", json("POST", input), {
    timeoutMs: LONG_TIMEOUT_MS,
  });
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

/**
 * Save a server file to disk.
 *
 * A plain `<a download>` is unreliable in an installed standalone PWA — the
 * navigation has nowhere to go. Fetching to a blob and clicking a synthetic
 * link keeps it inside the app.
 */
export async function downloadFile(url: string, filename: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(LONG_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();

  // iOS has no download folder to speak of: in a standalone PWA the `download`
  // attribute is unreliable and can fail silently. The share sheet is the
  // platform's actual "save a file" affordance, so prefer it where offered.
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // user dismissed the sheet
      /* otherwise fall through to the anchor */
    }
  }

  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
export const runBackupNow = () =>
  api<{ key: string; bytes: number; expenses: number; kept: number }>(
    "/api/backups/run",
    { method: "POST" },
    { timeoutMs: LONG_TIMEOUT_MS },
  );
