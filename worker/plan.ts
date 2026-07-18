import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gte, lte, sql, sum } from "drizzle-orm";
import { budgets, expenses, recurringRules } from "./db/schema";
import {
  budgetCreateSchema,
  budgetUpdateSchema,
  recurringCreateSchema,
  recurringUpdateSchema,
  type BudgetWithStatus,
} from "../shared/schemas";
import { advanceDue } from "../shared/recurrence";
import type { Env } from "./env";

const pad = (n: number) => String(n).padStart(2, "0");
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ---------- budgets ----------

const budgetsApp = new Hono<Env>();

budgetsApp.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(budgets).orderBy(asc(budgets.id));
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  const result: BudgetWithStatus[] = [];
  for (const b of rows) {
    const catCond = b.categoryId !== null ? [eq(expenses.categoryId, b.categoryId)] : [];
    const HISTORY = 6;

    let bucketExpr;
    let historyFrom: string;
    if (b.period === "monthly") {
      bucketExpr = sql<string>`substr(${expenses.spentAt}, 1, 7)`;
      const h = new Date(y, m - 1 - HISTORY, 1);
      historyFrom = `${h.getFullYear()}-${pad(h.getMonth() + 1)}-01`;
    } else {
      bucketExpr = sql<string>`substr(${expenses.spentAt}, 1, 4)`;
      historyFrom = `${y - HISTORY}-01-01`;
    }

    const grouped = await db
      .select({ period: bucketExpr, spentMinor: sum(expenses.amountMinor) })
      .from(expenses)
      .where(and(gte(expenses.spentAt, `${historyFrom} 00:00:00`), ...catCond))
      .groupBy(bucketExpr)
      .orderBy(bucketExpr);

    const currentKey = b.period === "monthly" ? `${y}-${pad(m)}` : String(y);
    const spentMinor = Number(grouped.find((g) => g.period === currentKey)?.spentMinor ?? 0);
    const history = grouped
      .filter((g) => g.period !== currentKey)
      .map((g) => ({ period: g.period, spentMinor: Number(g.spentMinor ?? 0) }))
      .reverse();

    result.push({ ...b, period: b.period as "monthly" | "yearly", spentMinor, history });
  }
  return c.json(result);
});

budgetsApp.post("/", zValidator("json", budgetCreateSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db.insert(budgets).values(c.req.valid("json")).returning();
  return c.json(row, 201);
});

budgetsApp.patch("/:id", zValidator("json", budgetUpdateSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const id = Number(c.req.param("id"));
  const [row] = await db
    .update(budgets)
    .set(c.req.valid("json"))
    .where(eq(budgets.id, id))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

budgetsApp.delete("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = Number(c.req.param("id"));
  const [row] = await db.delete(budgets).where(eq(budgets.id, id)).returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// ---------- recurring ----------

/**
 * Materialize every due occurrence of every active rule into real expenses.
 * Idempotent: each materialization advances next_due_on, so re-running is a no-op.
 * Catches up missed days (worker asleep) up to a safety cap per rule.
 */
export async function materializeDueRules(env: Env["Bindings"], today = todayLocal()) {
  const db = drizzle(env.DB);
  const due = await db
    .select()
    .from(recurringRules)
    .where(and(eq(recurringRules.active, true), lte(recurringRules.nextDueOn, today)));

  let created = 0;
  for (const rule of due) {
    let next = rule.nextDueOn;
    let guard = 0;
    while (next <= today && guard++ < 60) {
      if (rule.endOn && next > rule.endOn) {
        await db.update(recurringRules).set({ active: false }).where(eq(recurringRules.id, rule.id));
        break;
      }
      const advanced = advanceDue(next, rule.frequency as "weekly" | "monthly" | "yearly", rule.interval, rule.anchorDay);
      // insert + advance atomically so a crash can't double-log
      await db.batch([
        db.insert(expenses).values({
          categoryId: rule.categoryId,
          amountMinor: rule.amountMinor,
          note: rule.note,
          spentAt: `${next} 00:00:00`,
          recurringRuleId: rule.id,
        }),
        db.update(recurringRules).set({ nextDueOn: advanced }).where(eq(recurringRules.id, rule.id)),
      ]);
      created++;
      next = advanced;
    }
  }
  return { rulesDue: due.length, created };
}

const recurringApp = new Hono<Env>();

recurringApp.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(recurringRules).orderBy(asc(recurringRules.nextDueOn));
  return c.json(rows);
});

recurringApp.post("/", zValidator("json", recurringCreateSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const input = c.req.valid("json");
  const anchorDay =
    input.frequency === "monthly" ? Number(input.nextDueOn.slice(8, 10)) : null;
  const [row] = await db
    .insert(recurringRules)
    .values({ ...input, anchorDay })
    .returning();
  return c.json(row, 201);
});

recurringApp.patch("/:id", zValidator("json", recurringUpdateSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const id = Number(c.req.param("id"));
  const input = c.req.valid("json");
  const [existing] = await db.select().from(recurringRules).where(eq(recurringRules.id, id));
  if (!existing) return c.json({ error: "not found" }, 404);

  // keep anchorDay consistent with the effective frequency + due date
  const frequency = input.frequency ?? existing.frequency;
  const nextDueOn = input.nextDueOn ?? existing.nextDueOn;
  const anchorDay = frequency === "monthly" ? Number(nextDueOn.slice(8, 10)) : null;

  const [row] = await db
    .update(recurringRules)
    .set({ ...input, anchorDay })
    .where(eq(recurringRules.id, id))
    .returning();
  return c.json(row);
});

recurringApp.delete("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = Number(c.req.param("id"));
  // detach materialized expenses (keep them), then delete the rule
  await db.batch([
    db.update(expenses).set({ recurringRuleId: null }).where(eq(expenses.recurringRuleId, id)),
    db.delete(recurringRules).where(eq(recurringRules.id, id)),
  ]);
  return c.json({ ok: true });
});

// manual trigger (also used by tests; ?today=YYYY-MM-DD overrides for determinism)
recurringApp.post("/run-due", async (c) => {
  const override = c.req.query("today");
  const result = await materializeDueRules(
    c.env,
    override && /^\d{4}-\d{2}-\d{2}$/.test(override) ? override : undefined,
  );
  return c.json(result);
});

export { budgetsApp, recurringApp };
