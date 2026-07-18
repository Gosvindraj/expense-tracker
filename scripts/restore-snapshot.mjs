// Rebuild the D1 database from an R2/export JSON snapshot.
//
//   node scripts/restore-snapshot.mjs <snapshot.json> --local
//   node scripts/restore-snapshot.mjs <snapshot.json> --remote
//
// Wipes categories/expenses/import_batches and re-inserts everything from the
// snapshot (schema must already exist — run migrations first on a fresh DB).
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const [file, target] = process.argv.slice(2);
if (!file || !["--local", "--remote"].includes(target)) {
  console.error("usage: node scripts/restore-snapshot.mjs <snapshot.json> --local|--remote");
  process.exit(1);
}

const snap = JSON.parse(readFileSync(file, "utf8"));
if (snap.version !== 1) throw new Error(`unsupported snapshot version: ${snap.version}`);
const { categories, expenses, importBatches } = snap.tables;

const q = (v) =>
  v === null || v === undefined
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : typeof v === "boolean"
        ? (v ? "1" : "0")
        : `'${String(v).replace(/'/g, "''")}'`;

const lines = [
  "PRAGMA defer_foreign_keys = on;",
  "DELETE FROM expenses;",
  "DELETE FROM import_batches;",
  "DELETE FROM categories;",
];

for (const c of categories) {
  lines.push(
    `INSERT INTO categories (id, name, parent_id, icon, color, archived, sort_order) VALUES (${q(c.id)}, ${q(c.name)}, ${q(c.parentId)}, ${q(c.icon)}, ${q(c.color)}, ${q(c.archived)}, ${q(c.sortOrder)});`,
  );
}
for (const b of importBatches) {
  lines.push(
    `INSERT INTO import_batches (id, source, filename, row_count, imported_at) VALUES (${q(b.id)}, ${q(b.source)}, ${q(b.filename)}, ${q(b.rowCount)}, ${q(b.importedAt)});`,
  );
}
for (const e of expenses) {
  lines.push(
    `INSERT INTO expenses (id, category_id, amount_minor, note, spent_at, created_at, updated_at, import_batch_id) VALUES (${q(e.id)}, ${q(e.categoryId)}, ${q(e.amountMinor)}, ${q(e.note)}, ${q(e.spentAt)}, ${q(e.createdAt)}, ${q(e.updatedAt)}, ${q(e.importBatchId)});`,
  );
}

const dir = mkdtempSync(join(tmpdir(), "et-restore-"));
const sqlPath = join(dir, "restore.sql");
writeFileSync(sqlPath, lines.join("\n"), "utf8");
console.log(
  `restoring ${categories.length} categories, ${importBatches.length} batches, ${expenses.length} expenses (${target})`,
);
execSync(
  `npx wrangler d1 execute expense-tracker-db ${target} --file "${sqlPath}" -y`,
  { stdio: "inherit" },
);
console.log("restore complete");
