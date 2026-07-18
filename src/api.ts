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
} from "../shared/schemas";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let msg = `${init?.method ?? "GET"} ${path} failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
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

// ---------- import ----------

export const importPreview = (input: ImportPreviewRequest) =>
  api<ImportPreviewResult>("/api/import/preview", json("POST", input));
export const importCommit = (input: ImportCommitRequest) =>
  api<ImportCommitResult>("/api/import/commit", json("POST", input));
export const getImportBatches = () => api<ImportBatch[]>("/api/import/batches");
export const deleteImportBatch = (id: number) =>
  api<{ ok: true }>(`/api/import/batches/${id}`, { method: "DELETE" });
