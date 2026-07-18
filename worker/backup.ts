import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { asc, eq } from "drizzle-orm";
import { categories, expenses, importBatches } from "./db/schema";
import type { Env } from "./env";

const KEEP = 30;
const PREFIX = "snapshots/";

export interface Snapshot {
  version: 1;
  exportedAt: string; // ISO UTC
  tables: {
    categories: (typeof categories.$inferSelect)[];
    expenses: (typeof expenses.$inferSelect)[];
    importBatches: (typeof importBatches.$inferSelect)[];
  };
}

async function buildSnapshot(db: ReturnType<typeof drizzle>): Promise<Snapshot> {
  const [cats, exps, batches] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.id)),
    db.select().from(expenses).orderBy(asc(expenses.id)),
    db.select().from(importBatches).orderBy(asc(importBatches.id)),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: { categories: cats, expenses: exps, importBatches: batches },
  };
}

/** Dump all tables to R2 (one snapshot per day, latest wins) and prune to KEEP. */
export async function runBackup(env: Env["Bindings"]) {
  const db = drizzle(env.DB);
  const snapshot = await buildSnapshot(db);
  const day = snapshot.exportedAt.slice(0, 10);
  const key = `${PREFIX}${day}.json`;
  const body = JSON.stringify(snapshot);
  await env.BACKUPS.put(key, body, {
    httpMetadata: { contentType: "application/json" },
  });

  // prune oldest beyond KEEP (keys are date-named, so lexicographic = chronological)
  const listing = await env.BACKUPS.list({ prefix: PREFIX });
  const keys = listing.objects.map((o) => o.key).sort();
  const excess = keys.slice(0, Math.max(0, keys.length - KEEP));
  for (const k of excess) await env.BACKUPS.delete(k);

  return { key, bytes: body.length, expenses: snapshot.tables.expenses.length, kept: Math.min(keys.length, KEEP) };
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const app = new Hono<Env>();

app.get("/backups", async (c) => {
  const listing = await c.env.BACKUPS.list({ prefix: PREFIX });
  const items = listing.objects
    .map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
  return c.json(items);
});

app.post("/backups/run", async (c) => {
  const result = await runBackup(c.env);
  return c.json(result, 201);
});

app.get("/export", async (c) => {
  const db = drizzle(c.env.DB);
  const format = c.req.query("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const rows = await db
      .select({
        id: expenses.id,
        spentAt: expenses.spentAt,
        amountMinor: expenses.amountMinor,
        category: categories.name,
        note: expenses.note,
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .orderBy(asc(expenses.spentAt), asc(expenses.id));
    const lines = ["id,date,amount,category,note"];
    for (const r of rows) {
      lines.push(
        [
          String(r.id),
          r.spentAt,
          (r.amountMinor / 100).toFixed(2),
          csvCell(r.category ?? ""),
          csvCell(r.note),
        ].join(","),
      );
    }
    return c.body(lines.join("\n"), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${stamp}.csv"`,
    });
  }

  const snapshot = await buildSnapshot(db);
  return c.body(JSON.stringify(snapshot), 200, {
    "Content-Type": "application/json",
    "Content-Disposition": `attachment; filename="expense-tracker-${stamp}.json"`,
  });
});

export default app;
