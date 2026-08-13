import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { zValidator } from "@hono/zod-validator";
import { and, asc, count, desc, eq, gte, inArray, lte, like, sql, sum } from "drizzle-orm";
import { categories, expenses } from "./db/schema";
import importApp from "./import";
import statsApp from "./stats";
import backupApp, { runBackup } from "./backup";
import { budgetsApp, recurringApp, materializeDueRules } from "./plan";
import type { Env } from "./env";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  expenseListQuerySchema,
  type ExpenseListResult,
} from "../shared/schemas";

const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

const app = new Hono<Env>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

app.route("/import", importApp);
app.route("/stats", statsApp);
app.route("/", backupApp); // /api/backups, /api/export
app.route("/budgets", budgetsApp);
app.route("/recurring", recurringApp);

// ---------- categories ----------

app.get("/categories", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return c.json(rows);
});

// Category ids ordered by usage in the last 90 days — drives add-screen ordering.
app.get("/categories/recent", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ categoryId: expenses.categoryId, uses: count() })
    .from(expenses)
    .where(gte(expenses.spentAt, sql`datetime('now', '-90 days')`))
    .groupBy(expenses.categoryId)
    .orderBy(desc(count()))
    .limit(12);
  return c.json(rows.map((r) => r.categoryId));
});

app.post("/categories", zValidator("json", categoryCreateSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db.insert(categories).values(c.req.valid("json")).returning();
  return c.json(row, 201);
});

app.patch("/categories/:id", zValidator("json", categoryUpdateSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const id = Number(c.req.param("id"));
  const [row] = await db
    .update(categories)
    .set(c.req.valid("json"))
    .where(eq(categories.id, id))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

app.delete("/categories/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = Number(c.req.param("id"));
  const [used] = await db
    .select({ n: count() })
    .from(expenses)
    .where(eq(expenses.categoryId, id));
  if (used && used.n > 0) {
    return c.json({ error: `category has ${used.n} expenses — archive it instead` }, 409);
  }
  const [row] = await db.delete(categories).where(eq(categories.id, id)).returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// ---------- expenses ----------

function expenseFilters(q: ReturnType<typeof expenseListQuerySchema.parse>) {
  const conds = [];
  if (q.from) conds.push(gte(expenses.spentAt, `${q.from} 00:00:00`));
  if (q.to) conds.push(lte(expenses.spentAt, `${q.to} 23:59:59`));
  if (q.categories?.length) conds.push(inArray(expenses.categoryId, q.categories));
  if (q.q) conds.push(like(expenses.note, `%${q.q}%`));
  if (q.minMinor !== undefined) conds.push(gte(expenses.amountMinor, q.minMinor));
  if (q.maxMinor !== undefined) conds.push(lte(expenses.amountMinor, q.maxMinor));
  return conds.length ? and(...conds) : undefined;
}

/**
 * Note suggestions for the composer.
 *
 * Each distinct note comes back with how often it's been used and the
 * category/amount from its most recent occurrence — recency beats mode here,
 * since a subscription that changed price should suggest the new one.
 *
 * Server-side because suggestions have to see all history, not the pages the
 * client happens to have loaded.
 */
app.get("/expenses/notes", async (c) => {
  const db = drizzle(c.env.DB);
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const rows = await db.all<{
    note: string;
    n: number;
    categoryId: number;
    amountMinor: number;
  }>(sql`
    SELECT e.note AS note,
           COUNT(*) AS n,
           (SELECT e2.category_id FROM expenses e2
             WHERE e2.note = e.note ORDER BY e2.spent_at DESC LIMIT 1) AS categoryId,
           (SELECT e2.amount_minor FROM expenses e2
             WHERE e2.note = e.note ORDER BY e2.spent_at DESC LIMIT 1) AS amountMinor
      FROM expenses e
     WHERE e.note <> ''
       AND (${q} = '' OR lower(e.note) LIKE ${`%${q}%`})
     GROUP BY e.note
     ORDER BY n DESC, MAX(e.spent_at) DESC
     LIMIT 8
  `);
  return c.json(rows);
});

app.get("/expenses", zValidator("query", expenseListQuerySchema), async (c) => {
  const db = drizzle(c.env.DB);
  const q = c.req.valid("query");
  const where = expenseFilters(q);

  const [items, [agg]] = await Promise.all([
    db
      .select()
      .from(expenses)
      .where(where)
      .orderBy(desc(expenses.spentAt), desc(expenses.id))
      .limit(q.limit)
      .offset(q.offset),
    db
      .select({ total: count(), sumMinor: sum(expenses.amountMinor) })
      .from(expenses)
      .where(where),
  ]);

  const result: ExpenseListResult = {
    items,
    total: agg?.total ?? 0,
    sumMinor: Number(agg?.sumMinor ?? 0),
  };
  return c.json(result);
});

app.post("/expenses", zValidator("json", expenseCreateSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db.insert(expenses).values(c.req.valid("json")).returning();
  return c.json(row, 201);
});

app.patch("/expenses/:id", zValidator("json", expenseUpdateSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const id = Number(c.req.param("id"));
  const [row] = await db
    .update(expenses)
    .set({ ...c.req.valid("json"), updatedAt: nowStamp() })
    .where(eq(expenses.id, id))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

app.delete("/expenses/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = Number(c.req.param("id"));
  const [row] = await db.delete(expenses).where(eq(expenses.id, id)).returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

export default {
  fetch: app.fetch,
  // nightly cron (see wrangler.jsonc triggers): materialize due recurring
  // expenses first, then snapshot all tables to R2 (so the snapshot includes them)
  scheduled(_event, env, ctx) {
    ctx.waitUntil(materializeDueRules(env).then(() => runBackup(env)));
  },
} satisfies ExportedHandler<Env["Bindings"]>;
