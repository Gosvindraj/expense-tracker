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
  },
  (t) => [index("idx_expenses_spent_at").on(t.spentAt), index("idx_expenses_category").on(t.categoryId)],
);
