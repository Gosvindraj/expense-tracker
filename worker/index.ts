import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { zValidator } from "@hono/zod-validator";
import { asc } from "drizzle-orm";
import { accounts } from "./db/schema";
import { accountCreateSchema } from "../shared/schemas";

type Env = {
  Bindings: {
    DB: D1Database;
  };
};

const app = new Hono<Env>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

app.get("/accounts", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.sortOrder), asc(accounts.id));
  return c.json(rows);
});

app.post("/accounts", zValidator("json", accountCreateSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const [row] = await db.insert(accounts).values(c.req.valid("json")).returning();
  return c.json(row, 201);
});

export default app;
