import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  importPreview,
  importCommit,
  getImportBatches,
  deleteImportBatch,
  getBackups,
  runBackupNow,
  invalidateExpenseData,
} from "../api";
import { getCategories } from "../api";
import type { ImportPreviewResult, ImportCommitResult } from "../../shared/schemas";
import { fmtAmount } from "../lib/format";
import Categories from "./Categories";
import ConfirmSheet from "../components/ConfirmSheet";

type Mapping = Record<string, "create" | number>;
type Segment = "backups" | "import" | "categories";

function BackupsCard() {
  const queryClient = useQueryClient();
  const backupsQuery = useQuery({ queryKey: ["backups"], queryFn: getBackups });
  const [err, setErr] = useState<string | null>(null);

  const runMutation = useMutation({
    mutationFn: runBackupNow,
    onSuccess: () => {
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const backups = backupsQuery.data ?? [];
  const latest = backups[0];
  const ageHours = latest
    ? (Date.now() - new Date(latest.uploaded).getTime()) / 3600000
    : null;
  const staleWarning = latest === undefined || (ageHours !== null && ageHours > 48);

  return (
    <div className={`card ${staleWarning ? "warn" : ""}`}>
      {backupsQuery.isLoading ? (
        <p className="muted">Loading…</p>
      ) : latest ? (
        <p className="backup-status">
          Last snapshot:{" "}
          <strong>
            {new Date(latest.uploaded).toLocaleString(undefined, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </strong>{" "}
          ({(latest.size / 1024).toFixed(0)} KB) · {backups.length} kept
          {staleWarning && <strong className="error"> — more than 48 h old!</strong>}
        </p>
      ) : (
        <p className="backup-status error">
          No snapshots yet — nightly backup runs at 04:00 MYT, or run one now.
        </p>
      )}
      {err && <p className="error">{err}</p>}
      <div className="backup-actions">
        <button
          type="button"
          className="primary"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
        >
          {runMutation.isPending ? "Backing up…" : "Back up now"}
        </button>
        <a className="btn-link" href="/api/export?format=json" download>
          Export JSON
        </a>
        <a className="btn-link" href="/api/export?format=csv" download>
          Export CSV
        </a>
      </div>
    </div>
  );
}

export default function Import() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const batchesQuery = useQuery({ queryKey: ["import-batches"], queryFn: getImportBatches });

  const [seg, setSeg] = useState<Segment>("backups");
  const [confirmBatch, setConfirmBatch] = useState<{ id: number; count: number } | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [dupes, setDupes] = useState<"skip" | "include">("skip");
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const invalidateData = () => {
    invalidateExpenseData(queryClient);
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
      <h2>Data</h2>
      <div className="segmented">
        {(
          [
            ["backups", "Backups"],
            ["import", "Import"],
            ["categories", "Categories"],
          ] as [Segment, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={seg === id ? "on" : ""}
            onClick={() => setSeg(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {seg === "backups" && <BackupsCard />}
      {seg === "categories" && <Categories />}

      {seg === "import" && (
        <>
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
              onClick={() => setConfirmBatch({ id: b.id, count: b.expenseCount })}
            >
              Roll back
            </button>
          </li>
        ))}
      </ul>
        </>
      )}

      {confirmBatch && (
        <ConfirmSheet
          title={`Roll back batch #${confirmBatch.id}?`}
          message={`This deletes its ${confirmBatch.count} expenses.`}
          confirmLabel="Roll back"
          onConfirm={() => rollbackMutation.mutate(confirmBatch.id)}
          onClose={() => setConfirmBatch(null)}
        />
      )}
    </div>
  );
}
