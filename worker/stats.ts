import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { zValidator } from "@hono/zod-validator";
import { and, count, desc, gte, inArray, lte, max, min, sql, sum } from "drizzle-orm";
import { expenses } from "./db/schema";
import {
  statsFilterSchema,
  timeseriesQuerySchema,
  compareQuerySchema,
  type StatsFilter,
  type StatsSummary,
  type CategoryStat,
  type TimeseriesPoint,
  type CompareResult,
} from "../shared/schemas";

type Env = {
  Bindings: {
    DB: D1Database;
  };
};

function filtersToWhere(f: StatsFilter) {
  const conds = [];
  if (f.from) conds.push(gte(expenses.spentAt, `${f.from} 00:00:00`));
  if (f.to) conds.push(lte(expenses.spentAt, `${f.to} 23:59:59`));
  if (f.categories?.length) conds.push(inArray(expenses.categoryId, f.categories));
  return conds.length ? and(...conds) : undefined;
}

const BUCKET_EXPR = {
  day: sql<string>`substr(${expenses.spentAt}, 1, 10)`,
  month: sql<string>`substr(${expenses.spentAt}, 1, 7)`,
  year: sql<string>`substr(${expenses.spentAt}, 1, 4)`,
};

const app = new Hono<Env>();

app.get("/summary", zValidator("query", statsFilterSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const where = filtersToWhere(c.req.valid("query"));
  const [row] = await db
    .select({
      sumMinor: sum(expenses.amountMinor),
      count: count(),
      minDay: min(sql<string>`substr(${expenses.spentAt}, 1, 10)`),
      maxDay: max(sql<string>`substr(${expenses.spentAt}, 1, 10)`),
    })
    .from(expenses)
    .where(where);
  const result: StatsSummary = {
    sumMinor: Number(row?.sumMinor ?? 0),
    count: row?.count ?? 0,
    minDay: row?.minDay ?? null,
    maxDay: row?.maxDay ?? null,
  };
  return c.json(result);
});

app.get("/by-category", zValidator("query", statsFilterSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const where = filtersToWhere(c.req.valid("query"));
  const rows = await db
    .select({
      categoryId: expenses.categoryId,
      sumMinor: sum(expenses.amountMinor),
      count: count(),
    })
    .from(expenses)
    .where(where)
    .groupBy(expenses.categoryId)
    .orderBy(desc(sum(expenses.amountMinor)));
  const result: CategoryStat[] = rows.map((r) => ({
    categoryId: r.categoryId,
    sumMinor: Number(r.sumMinor ?? 0),
    count: r.count,
  }));
  return c.json(result);
});

app.get("/timeseries", zValidator("query", timeseriesQuerySchema), async (c) => {
  const db = drizzle(c.env.DB);
  const q = c.req.valid("query");
  const where = filtersToWhere(q);
  const bucketExpr = BUCKET_EXPR[q.bucket];
  const rows = await db
    .select({
      bucket: bucketExpr,
      sumMinor: sum(expenses.amountMinor),
      count: count(),
    })
    .from(expenses)
    .where(where)
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);
  const result: TimeseriesPoint[] = rows.map((r) => ({
    bucket: r.bucket,
    sumMinor: Number(r.sumMinor ?? 0),
    count: r.count,
  }));
  return c.json(result);
});

app.get("/compare", zValidator("query", compareQuerySchema), async (c) => {
  const db = drizzle(c.env.DB);
  const q = c.req.valid("query");
  const catCond = q.categories?.length
    ? [inArray(expenses.categoryId, q.categories)]
    : [];
  const whereA = and(
    gte(expenses.spentAt, `${q.fromA} 00:00:00`),
    lte(expenses.spentAt, `${q.toA} 23:59:59`),
    ...catCond,
  );
  const whereB = and(
    gte(expenses.spentAt, `${q.fromB} 00:00:00`),
    lte(expenses.spentAt, `${q.toB} 23:59:59`),
    ...catCond,
  );

  const grouped = (where: ReturnType<typeof and>) =>
    db
      .select({
        categoryId: expenses.categoryId,
        sumMinor: sum(expenses.amountMinor),
        count: count(),
      })
      .from(expenses)
      .where(where)
      .groupBy(expenses.categoryId);

  const [rowsA, rowsB] = await Promise.all([grouped(whereA), grouped(whereB)]);

  const byCat = new Map<number, { aMinor: number; bMinor: number }>();
  let aSum = 0;
  let aCount = 0;
  let bSum = 0;
  let bCount = 0;
  for (const r of rowsA) {
    const v = Number(r.sumMinor ?? 0);
    aSum += v;
    aCount += r.count;
    byCat.set(r.categoryId, { aMinor: v, bMinor: 0 });
  }
  for (const r of rowsB) {
    const v = Number(r.sumMinor ?? 0);
    bSum += v;
    bCount += r.count;
    const entry = byCat.get(r.categoryId);
    if (entry) entry.bMinor = v;
    else byCat.set(r.categoryId, { aMinor: 0, bMinor: v });
  }

  const result: CompareResult = {
    a: { sumMinor: aSum, count: aCount },
    b: { sumMinor: bSum, count: bCount },
    byCategory: [...byCat.entries()]
      .map(([categoryId, v]) => ({ categoryId, ...v }))
      .sort((x, y) => Math.abs(y.bMinor - y.aMinor) - Math.abs(x.bMinor - x.aMinor)),
  };
  return c.json(result);
});

export default app;
