import { z } from "zod";

// ---------- categories ----------

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  parentId: z.number().int().positive().nullable().default(null),
  icon: z.string().min(1).max(16).default("📦"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb hex color")
    .default("#8a8f98"),
  sortOrder: z.number().int().default(0),
});

export const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .extend({ archived: z.boolean().optional() });

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  icon: string;
  color: string;
  archived: boolean;
  sortOrder: number;
}

// ---------- expenses ----------

/** 'YYYY-MM-DD HH:MM:SS' — local time, sortable, SQLite-friendly. */
export const spentAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, "must be 'YYYY-MM-DD HH:MM:SS'");

export const expenseCreateSchema = z.object({
  categoryId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  note: z.string().trim().max(500).default(""),
  spentAt: spentAtSchema,
});

export const expenseUpdateSchema = expenseCreateSchema.partial();

export type ExpenseCreate = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdate = z.infer<typeof expenseUpdateSchema>;

export interface Expense {
  id: number;
  categoryId: number;
  amountMinor: number;
  note: string;
  spentAt: string;
  createdAt: string;
  updatedAt: string;
  importBatchId: number | null;
  recurringRuleId: number | null;
}

// ---------- expense list filters ----------

const intListParam = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.array(z.number().int().positive()));

export const expenseListQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // inclusive date
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // inclusive date
  categories: intListParam.optional(), // comma-separated ids
  q: z.string().trim().min(1).max(100).optional(), // note substring
  minMinor: z.coerce.number().int().positive().optional(),
  maxMinor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;

export interface ExpenseListResult {
  items: Expense[];
  total: number; // count of all rows matching the filter
  sumMinor: number; // sum of all rows matching the filter
}

// ---------- budgets ----------

export const budgetCreateSchema = z.object({
  categoryId: z.number().int().positive().nullable().default(null), // null = overall
  amountMinor: z.number().int().positive(),
  period: z.enum(["monthly", "yearly"]).default("monthly"),
});

export const budgetUpdateSchema = budgetCreateSchema
  .partial()
  .extend({ active: z.boolean().optional() });

export type BudgetCreate = z.infer<typeof budgetCreateSchema>;
export type BudgetUpdate = z.infer<typeof budgetUpdateSchema>;

export interface Budget {
  id: number;
  categoryId: number | null;
  amountMinor: number;
  period: "monthly" | "yearly";
  active: boolean;
  createdAt: string;
}

export interface BudgetWithStatus extends Budget {
  spentMinor: number; // current period
  history: { period: string; spentMinor: number }[]; // previous periods, newest first
}

// ---------- recurring ----------

export const recurringCreateSchema = z.object({
  categoryId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  note: z.string().trim().max(500).default(""),
  frequency: z.enum(["weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(24).default(1),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export const recurringUpdateSchema = recurringCreateSchema
  .partial()
  .extend({ active: z.boolean().optional() });

export type RecurringCreate = z.infer<typeof recurringCreateSchema>;
export type RecurringUpdate = z.infer<typeof recurringUpdateSchema>;

export interface RecurringRule {
  id: number;
  categoryId: number;
  amountMinor: number;
  note: string;
  frequency: "weekly" | "monthly" | "yearly";
  interval: number;
  anchorDay: number | null;
  nextDueOn: string;
  endOn: string | null;
  active: boolean;
  createdAt: string;
}

// ---------- stats ----------

const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const statsFilterSchema = z.object({
  from: dateParam.optional(),
  to: dateParam.optional(),
  categories: intListParam.optional(),
});

export const timeseriesQuerySchema = statsFilterSchema.extend({
  bucket: z.enum(["day", "month", "year"]).default("month"),
});

export const compareQuerySchema = z.object({
  fromA: dateParam,
  toA: dateParam,
  fromB: dateParam,
  toB: dateParam,
  categories: intListParam.optional(),
});

export type StatsFilter = z.infer<typeof statsFilterSchema>;
export type TimeseriesQuery = z.infer<typeof timeseriesQuerySchema>;
export type CompareQuery = z.infer<typeof compareQuerySchema>;

export interface StatsSummary {
  sumMinor: number;
  count: number;
  minDay: string | null; // earliest expense day in the filtered set
  maxDay: string | null;
}

export interface CategoryStat {
  categoryId: number;
  sumMinor: number;
  count: number;
}

export interface TimeseriesPoint {
  bucket: string; // '2023-05-14' | '2023-05' | '2023'
  sumMinor: number;
  count: number;
}

export interface CompareResult {
  a: { sumMinor: number; count: number };
  b: { sumMinor: number; count: number };
  byCategory: { categoryId: number; aMinor: number; bMinor: number }[];
}

// ---------- import ----------

export const importPreviewRequestSchema = z.object({
  csv: z.string().min(1),
  filename: z.string().trim().min(1).max(200),
});

export const importCommitRequestSchema = importPreviewRequestSchema.extend({
  // CSV category name -> existing category id, or "create" a new one
  mapping: z.record(z.string(), z.union([z.literal("create"), z.number().int().positive()])),
  duplicates: z.enum(["skip", "include"]).default("skip"),
});

export type ImportPreviewRequest = z.infer<typeof importPreviewRequestSchema>;
export type ImportCommitRequest = z.infer<typeof importCommitRequestSchema>;

export interface ImportPreviewResult {
  rows: number; // importable expense rows
  skippedNonExpense: number; // rows whose type isn't "Expenses"
  parseErrors: { line: number; error: string }[];
  sumMinor: number;
  dateMin: string | null;
  dateMax: string | null;
  // one entry per distinct CSV category, matched to an existing category by name
  categories: { name: string; count: number; matchedCategoryId: number | null }[];
  // rows whose (spentAt, amountMinor) already exists in the DB
  duplicates: number;
}

export interface ImportCommitResult {
  batchId: number;
  inserted: number;
  skippedDuplicates: number;
  createdCategories: string[];
}

export interface ImportBatch {
  id: number;
  source: string;
  filename: string;
  rowCount: number;
  importedAt: string;
  expenseCount: number; // rows currently in DB from this batch
}
