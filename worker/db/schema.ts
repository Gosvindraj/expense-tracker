import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("💰"),
  color: text("color").notNull().default("#4f6df5"),
  startingBalanceMinor: integer("starting_balance_minor").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});
