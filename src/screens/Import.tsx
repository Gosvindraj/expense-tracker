import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  importPreview,
  importCommit,
  getImportBatches,
  deleteImportBatch,
} from "../api";
import { getCategories } from "../api";
import type { ImportPreviewResult, ImportCommitResult } from "../../shared/schemas";
import { fmtAmount } from "../lib/format";

type Mapping = Record<string, "create" | number>;

export default function Import() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const batchesQuery = useQuery({ queryKey: ["import-batches"], queryFn: getImportBatches });

  const [csv, setCsv] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [dupes, setDupes] = useState<"skip" | "include">("skip");
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["recent-categories"] });
    queryClient.invalidateQueries({ queryKey: ["import-batches"] });
  };

  const previewMutation = useMutation({
    mutationFn: importPreview,
    onSuccess: (p) => {
      setPreview(p);
      // default mapping: matched -> its id, unmatched -> create
      const m: Mapping = {};
      for (const cat of p.categories) m[cat.name] = cat.matchedCategoryId ?? "create";
      setMapping(m);
      setResult(null);
      setErr(null);
    },
    onError: (e: Error) => setErr(e.message),
  });

  const commitMutation = useMutation({
    mutationFn: importCommit,
    onSuccess: (r) => {
      setResult(r);
      setPreview(null);
      setCsv(null);
      setErr(null);
      invalidateData();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const rollbackMutation = useMutation({
    mutationFn: deleteImportBatch,
    onSuccess: invalidateData,
    onError: (e: Error) => setErr(e.message),
  });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setFilename(file.name);
    setResult(null);
    previewMutation.mutate({ csv: text, filename: file.name });
    e.target.value = ""; // allow re-selecting the same file
  }

  const cats = (categoriesQuery.data ?? []).filter((c) => !c.archived);
  const unmatched = preview?.categories.filter((c) => c.matchedCategoryId === null) ?? [];

  return (
    <div className="import-screen">
      <h2>Import</h2>
      <p className="muted">
        Wallet CSV export (semicolon-separated). Upload, review the mapping, then import.
      </p>

      <label className="file-btn">
        {previewMutation.isPending ? "Reading…" : "Choose CSV file"}
        <input type="file" accept=".csv,text/csv" onChange={onFile} hidden />
      </label>

      {err && <p className="error">{err}</p>}

      {result && (
        <div className="card success">
          <strong>Import complete.</strong> {result.inserted} expenses imported
          {result.skippedDuplicates > 0 && <>, {result.skippedDuplicates} duplicates skipped</>}
          {result.createdCategories.length > 0 && (
            <>, new categories: {result.createdCategories.join(", ")}</>
          )}
          . Batch #{result.batchId} — you can roll it back below.
        </div>
      )}

      {preview && (
        <div className="card">
          <h3>{filename}</h3>
          <ul className="preview-stats">
            <li><strong>{preview.rows}</strong> expenses</li>
            <li>
              <strong>{preview.dateMin?.slice(0, 10)}</strong> →{" "}
              <strong>{preview.dateMax?.slice(0, 10)}</strong>
            </li>
            <li>Total <strong>{fmtAmount(preview.sumMinor)}</strong></li>
            {preview.skippedNonExpense > 0 && (
              <li>{preview.skippedNonExpense} non-expense rows will be skipped</li>
            )}
          </ul>

          {preview.parseErrors.length > 0 && (
            <div className="error">
              {preview.parseErrors.length} rows can't be parsed (import blocked):
              <ul>
                {preview.parseErrors.slice(0, 5).map((pe) => (
                  <li key={pe.line}>line {pe.line}: {pe.error}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.duplicates > 0 && (
            <div className="dupes">
              <p>
                <strong>{preview.duplicates}</strong> rows match existing expenses
                (same time + amount):
              </p>
              <label>
                <input
                  type="radio"
                  checked={dupes === "skip"}
                  onChange={() => setDupes("skip")}
                />{" "}
                Skip them (recommended)
              </label>
              <label>
                <input
                  type="radio"
                  checked={dupes === "include"}
                  onChange={() => setDupes("include")}
                />{" "}
                Import anyway
              </label>
            </div>
          )}

          <h4>
            Category mapping{" "}
            {unmatched.length === 0 && (
              <span className="muted">— all {preview.categories.length} matched by name</span>
            )}
          </h4>
          <div className="mapping-table">
            {preview.categories.map((pc) => (
              <div className="mapping-row" key={pc.name}>
                <span className="mid">
                  {pc.name} <span className="muted">({pc.count})</span>
                </span>
                <select
                  value={String(mapping[pc.name] ?? "create")}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      [pc.name]: e.target.value === "create" ? "create" : Number(e.target.value),
                    }))
                  }
                >
                  <option value="create">＋ Create new category</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="primary import-btn"
            disabled={commitMutation.isPending || preview.parseErrors.length > 0 || !csv}
            onClick={() =>
              commitMutation.mutate({ csv: csv!, filename, mapping, duplicates: dupes })
            }
          >
            {commitMutation.isPending ? "Importing…" : `Import ${preview.rows} expenses`}
          </button>
        </div>
      )}

      <h3>Past imports</h3>
      {(batchesQuery.data ?? []).length === 0 && <p className="muted">None yet.</p>}
      <ul className="cat-list">
        {(batchesQuery.data ?? []).map((b) => (
          <li key={b.id}>
            <span className="mid">
              <span>
                #{b.id} — {b.filename}
              </span>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                {b.importedAt} · {b.expenseCount} expenses in DB
              </span>
            </span>
            <button
              type="button"
              className="danger"
              disabled={rollbackMutation.isPending}
              onClick={() => {
                if (confirm(`Roll back batch #${b.id}? This deletes its ${b.expenseCount} expenses.`))
                  rollbackMutation.mutate(b.id);
              }}
            >
              Roll back
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
