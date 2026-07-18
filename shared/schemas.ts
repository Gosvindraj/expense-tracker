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
