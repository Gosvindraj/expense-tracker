import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { zValidator } from "@hono/zod-validator";
import { count, desc, eq } from "drizzle-orm";
import { categories, expenses, importBatches } from "./db/schema";
import {
  importPreviewRequestSchema,
  importCommitRequestSchema,
  type ImportPreviewResult,
  type ImportCommitResult,
  type ImportBatch,
} from "../shared/schemas";
import type { Env } from "./env";

// ---------- Wallet CSV parsing ----------

/** Semicolon-separated CSV with double-quote escaping (Wallet by BudgetBakers export). */
function parseCsv(text: string, delim = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

interface ParsedRow {
  line: number; // 1-based line in the file (for error reporting)
  categoryName: string;
  amountMinor: number;
  note: string;
  spentAt: string;
}

interface ParseOutcome {
  rows: ParsedRow[];
  skippedNonExpense: number;
  errors: { line: number; error: string }[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function parseWalletCsv(csv: string): ParseOutcome | { fatal: string } {
  const raw = parseCsv(csv);
  if (raw.length < 2) return { fatal: "file has no data rows" };
  const header = raw[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iCategory = col("category");
  const iAmount = col("amount");
  const iType = col("type");
  const iNote = col("note");
  const iDate = col("date");
  if (iCategory < 0 || iAmount < 0 || iType < 0 || iDate < 0) {
    return { fatal: `missing expected columns (need category, amount, type, date); found: ${header.join(", ")}` };
  }

  const out: ParseOutcome = { rows: [], skippedNonExpense: 0, errors: [] };
  for (let r = 1; r < raw.length; r++) {
    const line = r + 1;
    const cells = raw[r];
    const type = (cells[iType] ?? "").trim();
    if (type !== "Expenses") {
      out.skippedNonExpense++;
      continue;
    }
    const categoryName = (cells[iCategory] ?? "").trim();
    if (!categoryName) {
      out.errors.push({ line, error: "empty category" });
      continue;
    }
    const amountRaw = (cells[iAmount] ?? "").trim();
    const amount = Number(amountRaw);
    if (!amountRaw || !Number.isFinite(amount) || amount === 0) {
      out.errors.push({ line, error: `bad amount: "${amountRaw}"` });
      continue;
    }
    const spentAt = (cells[iDate] ?? "").trim();
    if (!DATE_RE.test(spentAt)) {
      out.errors.push({ line, error: `bad date: "${spentAt}"` });
      continue;
    }
    out.rows.push({
      line,
      categoryName,
      amountMinor: Math.round(Math.abs(amount) * 100),
      note: (iNote >= 0 ? (cells[iNote] ?? "") : "").trim(),
      spentAt,
    });
  }
  return out;
}

const dupKey = (spentAt: string, amountMinor: number) => `${spentAt}|${amountMinor}`;

async function existingDupKeys(db: ReturnType<typeof drizzle>): Promise<Set<string>> {
  const rows = await db
    .select({ spentAt: expenses.spentAt, amountMinor: expenses.amountMinor })
    .from(expenses);
  return new Set(rows.map((r) => dupKey(r.spentAt, r.amountMinor)));
}

// ---------- routes ----------

const app = new Hono<Env>();

app.post("/preview", zValidator("json", importPreviewRequestSchema), async (c) => {
  const { csv } = c.req.valid("json");
  const parsed = parseWalletCsv(csv);
  if ("fatal" in parsed) return c.json({ error: parsed.fatal }, 400);

  const db = drizzle(c.env.DB);
  const cats = await db.select().from(categories);
  const byName = new Map(cats.map((cat) => [cat.name.toLowerCase(), cat.id]));

  const perCategory = new Map<string, number>();
  let sumMinor = 0;
  let dateMin: string | null = null;
  let dateMax: string | null = null;
  for (const row of parsed.rows) {
    perCategory.set(row.categoryName, (perCategory.get(row.categoryName) ?? 0) + 1);
    sumMinor += row.amountMinor;
    if (dateMin === null || row.spentAt < dateMin) dateMin = row.spentAt;
    if (dateMax === null || row.spentAt > dateMax) dateMax = row.spentAt;
  }

  const dupes = await existingDupKeys(db);
  const duplicates = parsed.rows.filter((r) => dupes.has(dupKey(r.spentAt, r.amountMinor))).length;

  const result: ImportPreviewResult = {
    rows: parsed.rows.length,
    skippedNonExpense: parsed.skippedNonExpense,
    parseErrors: parsed.errors,
    sumMinor,
    dateMin,
    dateMax,
    categories: [...perCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => ({
        name,
        count: n,
        matchedCategoryId: byName.get(name.toLowerCase()) ?? null,
      })),
    duplicates,
  };
  return c.json(result);
});

app.post("/commit", zValidator("json", importCommitRequestSchema), async (c) => {
  const { csv, filename, mapping, duplicates } = c.req.valid("json");
  const parsed = parseWalletCsv(csv);
  if ("fatal" in parsed) return c.json({ error: parsed.fatal }, 400);
  if (parsed.errors.length > 0) {
    return c.json(
      { error: `file has ${parsed.errors.length} unparseable rows — fix or re-export first` },
      400,
    );
  }

  const db = drizzle(c.env.DB);
  const cats = await db.select().from(categories);
  const byId = new Set(cats.map((cat) => cat.id));
  const byName = new Map(cats.map((cat) => [cat.name.toLowerCase(), cat.id]));

  // resolve mapping: every distinct CSV category must resolve to a category id
  const resolved = new Map<string, number>();
  const createdCategories: string[] = [];
  const distinctNames = [...new Set(parsed.rows.map((r) => r.categoryName))];
  for (const name of distinctNames) {
    const wanted = mapping[name];
    if (wanted === undefined) {
      // fall back to exact name match
      const auto = byName.get(name.toLowerCase());
      if (auto === undefined) return c.json({ error: `no mapping for category "${name}"` }, 400);
      resolved.set(name, auto);
    } else if (wanted === "create") {
      const existing = byName.get(name.toLowerCase());
      if (existing !== undefined) {
        resolved.set(name, existing);
      } else {
        const [row] = await db
          .insert(categories)
          .values({ name, icon: "📦", color: "#8a8f98", sortOrder: 900 })
          .returning();
        resolved.set(name, row.id);
        byName.set(name.toLowerCase(), row.id);
        createdCategories.push(name);
      }
    } else {
      if (!byId.has(wanted)) return c.json({ error: `unknown category id ${wanted} for "${name}"` }, 400);
      resolved.set(name, wanted);
    }
  }

  // duplicate filtering
  let toInsert = parsed.rows;
  let skippedDuplicates = 0;
  if (duplicates === "skip") {
    const dupes = await existingDupKeys(db);
    toInsert = parsed.rows.filter((r) => !dupes.has(dupKey(r.spentAt, r.amountMinor)));
    skippedDuplicates = parsed.rows.length - toInsert.length;
  }

  const [batch] = await db
    .insert(importBatches)
    .values({ source: "wallet-csv", filename, rowCount: toInsert.length })
    .returning();

  if (toInsert.length > 0) {
    const values = toInsert.map((r) => ({
      categoryId: resolved.get(r.categoryName)!,
      amountMinor: r.amountMinor,
      note: r.note,
      spentAt: r.spentAt,
      importBatchId: batch.id,
    }));
    // chunked to stay under D1's bound-parameter limit; db.batch is atomic
    const CHUNK = 18;
    const stmts = [];
    for (let i = 0; i < values.length; i += CHUNK) {
      stmts.push(db.insert(expenses).values(values.slice(i, i + CHUNK)));
    }
    await db.batch(stmts as [(typeof stmts)[0], ...typeof stmts]);
  }

  const result: ImportCommitResult = {
    batchId: batch.id,
    inserted: toInsert.length,
    skippedDuplicates,
    createdCategories,
  };
  return c.json(result, 201);
});

app.get("/batches", async (c) => {
  const db = drizzle(c.env.DB);
  const batches = await db.select().from(importBatches).orderBy(desc(importBatches.id));
  const counts = await db
    .select({ batchId: expenses.importBatchId, n: count() })
    .from(expenses)
    .groupBy(expenses.importBatchId);
  const byBatch = new Map(counts.map((r) => [r.batchId, r.n]));
  const result: ImportBatch[] = batches.map((b) => ({
    ...b,
    expenseCount: byBatch.get(b.id) ?? 0,
  }));
  return c.json(result);
});

app.delete("/batches/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = Number(c.req.param("id"));
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, id));
  if (!batch) return c.json({ error: "not found" }, 404);
  await db.batch([
    db.delete(expenses).where(eq(expenses.importBatchId, id)),
    db.delete(importBatches).where(eq(importBatches.id, id)),
  ]);
  return c.json({ ok: true });
});

export default app;
