import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  parentId: integer("parent_id"),
  icon: text("icon").notNull().default("📦"),
  color: text("color").notNull().default("#8a8f98"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull(),
  importedAt: text("imported_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id").references(() => categories.id), // NULL = overall
  amountMinor: integer("amount_minor").notNull(),
  period: text("period").notNull().default("monthly"), // 'monthly' | 'yearly'
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const recurringRules = sqliteTable("recurring_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  amountMinor: integer("amount_minor").notNull(),
  note: text("note").notNull().default(""),
  frequency: text("frequency").notNull(), // 'weekly' | 'monthly' | 'yearly'
  interval: integer("interval").notNull().default(1),
  anchorDay: integer("anchor_day"), // monthly rules: 1..31, clamped to month length
  nextDueOn: text("next_due_on").notNull(), // 'YYYY-MM-DD'
  endOn: text("end_on"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    amountMinor: integer("amount_minor").notNull(), // positive cents
    note: text("note").notNull().default(""),
    spentAt: text("spent_at").notNull(), // 'YYYY-MM-DD HH:MM:SS' local time
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    importBatchId: integer("import_batch_id").references(() => importBatches.id),
    recurringRuleId: integer("recurring_rule_id").references(() => recurringRules.id),
  },
  (t) => [index("idx_expenses_spent_at").on(t.spentAt), index("idx_expenses_category").on(t.categoryId)],
);
