import { useMemo, useRef, useState, useLayoutEffect } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getCategories,
  getStatsSummary,
  getStatsByCategory,
  getStatsTimeseries,
  getStatsCompare,
  type ExpenseFilters,
  type StatsFilters,
} from "../api";
import type { Category, TimeseriesPoint } from "../../shared/schemas";
import { fmtAmount } from "../lib/format";

type Bucket = "day" | "month" | "year";

// ---------- date helpers ----------

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lastDay = (y: number, m1: number) => new Date(y, m1, 0).getDate(); // m1: 1-based
const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${ym}-01`, to: `${ym}-${pad(lastDay(y, m))}` };
};
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000) + 1;

const THIS_YEAR = new Date().getFullYear();
const THIS_MONTH = `${THIS_YEAR}-${pad(new Date().getMonth() + 1)}`;

function presetRange(key: string): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  switch (key) {
    case "this-month":
      return monthRange(`${y}-${pad(m)}`);
    case "last-month": {
      const d = new Date(y, m - 2, 1);
      return monthRange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    }
    case "this-year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last-year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "all":
      return {};
    default:
      if (/^year-\d{4}$/.test(key)) {
        const yy = key.slice(5);
        return { from: `${yy}-01-01`, to: `${yy}-12-31` };
      }
      return {};
  }
}

function defaultBucket(from?: string, to?: string): Bucket {
  if (!from || !to) return "month";
  const days = daysBetween(from, to);
  if (days <= 62) return "day";
  if (days <= 1100) return "month";
  return "year";
}

// zero-fill missing buckets so the timeline has no silent gaps
function fillBuckets(points: TimeseriesPoint[], bucket: Bucket, from?: string, to?: string) {
  if (points.length === 0) return points;
  const start = from ?? points[0].bucket;
  const end = to ?? points[points.length - 1].bucket;
  const byKey = new Map(points.map((p) => [p.bucket, p]));
  const out: TimeseriesPoint[] = [];
  if (bucket === "day") {
    for (let d = start.slice(0, 10); d <= end.slice(0, 10); d = addDays(d, 1))
      out.push(byKey.get(d) ?? { bucket: d, sumMinor: 0, count: 0 });
  } else if (bucket === "month") {
    let [yy, mm] = start.slice(0, 7).split("-").map(Number);
    const endKey = end.slice(0, 7);
    for (;;) {
      const key = `${yy}-${pad(mm)}`;
      out.push(byKey.get(key) ?? { bucket: key, sumMinor: 0, count: 0 });
      if (key === endKey) break;
      mm++;
      if (mm > 12) {
        mm = 1;
        yy++;
      }
    }
  } else {
    for (let yy = Number(start.slice(0, 4)); yy <= Number(end.slice(0, 4)); yy++) {
      const key = String(yy);
      out.push(byKey.get(key) ?? { bucket: key, sumMinor: 0, count: 0 });
    }
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function bucketLabel(key: string, bucket: Bucket): string {
  if (bucket === "day") return `${Number(key.slice(8, 10))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;
  if (bucket === "month") return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
  return key;
}
function bucketToRange(key: string, bucket: Bucket): { from: string; to: string } {
  if (bucket === "day") return { from: key, to: key };
  if (bucket === "month") return monthRange(key);
  return { from: `${key}-01-01`, to: `${key}-12-31` };
}

const PRESET_LABELS: Record<string, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
  "last-year": "Last year",
  all: "All time",
};

function periodLabel(preset: string, customFrom: string, customTo: string): string {
  if (PRESET_LABELS[preset]) return PRESET_LABELS[preset];
  if (/^year-\d{4}$/.test(preset)) return preset.slice(5);
  if (preset === "custom") {
    if (customFrom || customTo) return `${customFrom || "…"} → ${customTo || "…"}`;
    return "Custom range";
  }
  return "Period";
}

function PeriodSheet({
  current,
  years,
  customFrom,
  customTo,
  onPick,
  onApplyCustom,
  onClose,
}: {
  current: string;
  years: number[];
  customFrom: string;
  customTo: string;
  onPick: (key: string) => void;
  onApplyCustom: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(customFrom);
  const [to, setTo] = useState(customTo);
  const [customOpen, setCustomOpen] = useState(current === "custom");

  const rows: [string, string][] = [
    ["this-month", "This month"],
    ["last-month", "Last month"],
    ["this-year", "This year"],
    ["last-year", "Last year"],
    ["all", "All time"],
    ...years.map((y) => [`year-${y}`, String(y)] as [string, string]),
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal picker-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Period</h3>
        <div className="sheet-rows">
          {rows.map(([key, label]) => (
            <button key={key} type="button" className="sheet-row" onClick={() => onPick(key)}>
              <span>{label}</span>
              {current === key && <span className="check">✓</span>}
            </button>
          ))}
          <button
            type="button"
            className="sheet-row"
            onClick={() => setCustomOpen((o) => !o)}
          >
            <span>Custom range</span>
            {current === "custom" && !customOpen && <span className="check">✓</span>}
          </button>
          {customOpen && (
            <div className="sheet-custom">
              <div className="row">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <button
                type="button"
                className="primary"
                disabled={!from && !to}
                onClick={() => onApplyCustom(from, to)}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- main screen ----------

export default function Stats({
  onOpenExpenses,
}: {
  onOpenExpenses: (f: ExpenseFilters) => void;
}) {
  const [preset, setPreset] = useState("this-month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [catFilter, setCatFilter] = useState<number[]>([]);
  const [catsOpen, setCatsOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);

  const range =
    preset === "custom"
      ? { from: customFrom || undefined, to: customTo || undefined }
      : presetRange(preset);
  const filters: StatsFilters = {
    ...range,
    categories: catFilter.length ? catFilter : undefined,
  };

  const [bucketOverride, setBucketOverride] = useState<Bucket | null>(null);
  const bucket = bucketOverride ?? defaultBucket(range.from, range.to);

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const catById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c])),
    [categoriesQuery.data],
  );

  const summaryQuery = useQuery({
    queryKey: ["stats-summary", filters],
    queryFn: () => getStatsSummary(filters),
    placeholderData: keepPreviousData,
  });

  // previous period of the same length, for the delta on the total tile
  const prevRange = useMemo(() => {
    if (!range.from || !range.to) return null;
    const len = daysBetween(range.from, range.to);
    const prevTo = addDays(range.from, -1);
    return { from: addDays(prevTo, -(len - 1)), to: prevTo };
  }, [range.from, range.to]);

  const prevSummaryQuery = useQuery({
    queryKey: ["stats-summary-prev", prevRange, catFilter],
    queryFn: () =>
      getStatsSummary({ ...prevRange!, categories: filters.categories }),
    enabled: prevRange !== null,
    placeholderData: keepPreviousData,
  });

  const byCategoryQuery = useQuery({
    queryKey: ["stats-by-category", filters],
    queryFn: () => getStatsByCategory(filters),
    placeholderData: keepPreviousData,
  });

  const timeseriesQuery = useQuery({
    queryKey: ["stats-timeseries", filters, bucket],
    queryFn: () => getStatsTimeseries(filters, bucket),
    placeholderData: keepPreviousData,
  });

  const summary = summaryQuery.data;
  const days =
    range.from && range.to
      ? daysBetween(range.from, range.to > ymd(new Date()) ? ymd(new Date()) : range.to)
      : summary?.minDay && summary.maxDay
        ? daysBetween(summary.minDay, summary.maxDay)
        : 0;
  const avgPerDay = summary && days > 0 ? Math.round(summary.sumMinor / days) : 0;

  const prev = prevSummaryQuery.data;
  const deltaPct =
    prev && prev.sumMinor > 0 && summary
      ? ((summary.sumMinor - prev.sumMinor) / prev.sumMinor) * 100
      : null;

  const series = useMemo(
    () => fillBuckets(timeseriesQuery.data ?? [], bucket, range.from, range.to),
    [timeseriesQuery.data, bucket, range.from, range.to],
  );

  const years = useMemo(() => {
    const ys = [];
    for (let y = THIS_YEAR; y >= 2022; y--) ys.push(y);
    return ys;
  }, []);

  const drill = (extra: { from?: string; to?: string; categories?: number[] }) =>
    onOpenExpenses({
      from: extra.from ?? range.from,
      to: extra.to ?? range.to,
      categories: extra.categories ?? (catFilter.length ? catFilter : undefined),
    });

  const stale = summaryQuery.isPlaceholderData || byCategoryQuery.isPlaceholderData;

  return (
    <div className={`stats-screen ${stale ? "stale" : ""}`}>
      {/* ---- filter row ---- */}
      <div className="stats-filters">
        <button type="button" className="period-btn" onClick={() => setPeriodOpen(true)}>
          <span>{periodLabel(preset, customFrom, customTo)}</span>
          <svg viewBox="0 0 24 24" className="chev">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          className={catFilter.length ? "cat-filter-btn on" : "cat-filter-btn"}
          onClick={() => setCatsOpen((o) => !o)}
        >
          {catFilter.length ? `${catFilter.length} categories` : "All categories"}
        </button>
      </div>
      {periodOpen && (
        <PeriodSheet
          current={preset}
          years={years}
          customFrom={customFrom}
          customTo={customTo}
          onPick={(key) => {
            setPreset(key);
            setBucketOverride(null);
            setPeriodOpen(false);
          }}
          onApplyCustom={(f, t) => {
            setCustomFrom(f);
            setCustomTo(t);
            setPreset("custom");
            setBucketOverride(null);
            setPeriodOpen(false);
          }}
          onClose={() => setPeriodOpen(false)}
        />
      )}
      {catsOpen && (
        <div className="filter-cats" style={{ marginBottom: "0.75rem" }}>
          {(categoriesQuery.data ?? [])
            .filter((c) => !c.archived)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                className={`cat-chip small ${catFilter.includes(c.id) ? "selected" : ""}`}
                onClick={() =>
                  setCatFilter((s) =>
                    s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id],
                  )
                }
              >
                {c.icon} {c.name}
              </button>
            ))}
          {catFilter.length > 0 && (
            <button type="button" className="cat-chip small" onClick={() => setCatFilter([])}>
              ✕ clear
            </button>
          )}
        </div>
      )}

      {/* ---- KPI tiles ---- */}
      <div className="kpi-row">
        <div className="stat-tile">
          <span className="stat-label">Total spent</span>
          <span className="stat-value">{fmtAmount(summary?.sumMinor ?? 0)}</span>
          {deltaPct !== null && (
            <span className={`stat-delta ${deltaPct > 0 ? "up" : "down"}`}>
              {deltaPct > 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(0)}% vs previous
            </span>
          )}
        </div>
        <div className="stat-tile">
          <span className="stat-label">Expenses</span>
          <span className="stat-value">{summary?.count ?? 0}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Avg / day</span>
          <span className="stat-value">{fmtAmount(avgPerDay)}</span>
        </div>
      </div>

      {/* ---- spending over time ---- */}
      <div className="card">
        <div className="card-head">
          <h3>Spending over time</h3>
          <div className="bucket-switch">
            {(["day", "month", "year"] as Bucket[]).map((b) => (
              <button
                key={b}
                type="button"
                className={bucket === b ? "on" : ""}
                onClick={() => setBucketOverride(b)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <ColumnChart
          points={series}
          bucket={bucket}
          onBarClick={(key) => drill(bucketToRange(key, bucket))}
        />
      </div>

      {/* ---- by category ---- */}
      <div className="card">
        <div className="card-head">
          <h3>By category</h3>
        </div>
        <CategoryTable
          stats={byCategoryQuery.data ?? []}
          catById={catById}
          totalMinor={summary?.sumMinor ?? 0}
          onRowClick={(id) => drill({ categories: [id] })}
        />
      </div>

      {/* ---- compare ---- */}
      <Compare catById={catById} categories={filters.categories} />
    </div>
  );
}

// ---------- column chart (single series, hand-rolled SVG) ----------

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width: w };
}

function niceCeil(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp;
}

const tickLabel = (minor: number) => {
  const rm = minor / 100;
  if (rm >= 1000) return `${Math.round(rm / 100) / 10}k`;
  return String(Math.round(rm));
};

function ColumnChart({
  points,
  bucket,
  onBarClick,
}: {
  points: TimeseriesPoint[];
  bucket: Bucket;
  onBarClick: (bucketKey: string) => void;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const H = 200;
  const M = { top: 10, right: 6, bottom: 22, left: 40 };
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = H - M.top - M.bottom;

  if (points.length === 0) {
    return <div ref={ref} className="chart-empty muted">No data in this range.</div>;
  }

  const maxV = niceCeil(Math.max(...points.map((p) => p.sumMinor), 1));
  const yTicks = [0, maxV / 2, maxV];
  const n = points.length;
  const band = n > 0 ? innerW / n : 0;
  const barW = Math.max(2, Math.min(24, band * 0.72));
  const y = (v: number) => M.top + innerH * (1 - v / maxV);

  const labelEvery = Math.max(1, Math.ceil(n / 6));

  const roundedBar = (x: number, yTop: number, w: number, yBase: number) => {
    const r = Math.min(4, w / 2, Math.max(0, yBase - yTop));
    return `M ${x} ${yBase} V ${yTop + r} Q ${x} ${yTop} ${x + r} ${yTop} H ${x + w - r} Q ${x + w} ${yTop} ${x + w} ${yTop + r} V ${yBase} Z`;
  };

  const hovered = hover !== null ? points[hover] : null;
  const hoverX = hover !== null ? M.left + hover * band + band / 2 : 0;

  return (
    <div ref={ref} className="chart-wrap">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Spending over time">
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text x={M.left - 6} y={y(t) + 3.5} textAnchor="end" className="tick-text">
                {tickLabel(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x = M.left + i * band + (band - barW) / 2;
            const yTop = y(p.sumMinor);
            return (
              <g key={p.bucket}>
                {p.sumMinor > 0 && (
                  <path
                    d={roundedBar(x, yTop, barW, y(0))}
                    fill={hover === i ? "var(--accent-hover)" : "var(--accent)"}
                  />
                )}
                {/* full-height hit target, wider than the mark */}
                <rect
                  x={M.left + i * band}
                  y={M.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  onClick={() => onBarClick(p.bucket)}
                />
                {i % labelEvery === 0 && (
                  <text
                    x={M.left + i * band + band / 2}
                    y={H - 6}
                    textAnchor="middle"
                    className="tick-text"
                  >
                    {bucketLabel(p.bucket, bucket)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hovered && (
        <div
          className="chart-tooltip"
          style={{
            left: `${Math.min(Math.max(hoverX, 70), Math.max(width - 70, 70))}px`,
          }}
        >
          <span className="tt-value">{fmtAmount(hovered.sumMinor)}</span>
          <span className="tt-label">
            {bucketLabel(hovered.bucket, bucket)} · {hovered.count} expense
            {hovered.count === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------- category breakdown (table with inline bars) ----------

function CategoryTable({
  stats,
  catById,
  totalMinor,
  onRowClick,
}: {
  stats: { categoryId: number; sumMinor: number; count: number }[];
  catById: Map<number, Category>;
  totalMinor: number;
  onRowClick: (categoryId: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (stats.length === 0) return <p className="muted">No data in this range.</p>;
  const maxV = Math.max(...stats.map((s) => s.sumMinor));
  const visible = showAll ? stats : stats.slice(0, 10);
  return (
    <div className="cat-table">
      {visible.map((s) => {
        const cat = catById.get(s.categoryId);
        const pct = totalMinor > 0 ? (s.sumMinor / totalMinor) * 100 : 0;
        return (
          <button
            type="button"
            key={s.categoryId}
            className="cat-row"
            onClick={() => onRowClick(s.categoryId)}
          >
            <span className="cat-row-head">
              <span className="cat-row-name">
                {cat?.icon ?? "📦"} {cat?.name ?? "Unknown"}
              </span>
              <span className="cat-row-val">
                {fmtAmount(s.sumMinor)} <span className="muted">({pct.toFixed(1)}%)</span>
              </span>
            </span>
            <span className="cat-row-track">
              <span
                className="cat-row-bar"
                style={{
                  width: `${maxV > 0 ? (s.sumMinor / maxV) * 100 : 0}%`,
                  background: cat?.color ?? "#8a8f98",
                }}
              />
            </span>
          </button>
        );
      })}
      {stats.length > 10 && (
        <button type="button" className="load-more" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show top 10" : `Show all ${stats.length} categories`}
        </button>
      )}
    </div>
  );
}

// ---------- compare ----------

function Compare({
  catById,
  categories,
}: {
  catById: Map<number, Category>;
  categories?: number[];
}) {
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevMonthDate.getFullYear()}-${pad(prevMonthDate.getMonth() + 1)}`;

  const [mode, setMode] = useState<"month" | "year">("month");
  const [monthA, setMonthA] = useState(prevMonth);
  const [monthB, setMonthB] = useState(THIS_MONTH);
  const [yearA, setYearA] = useState(String(THIS_YEAR - 1));
  const [yearB, setYearB] = useState(String(THIS_YEAR));
  const [showAll, setShowAll] = useState(false);

  const rangeA =
    mode === "month" ? monthRange(monthA) : { from: `${yearA}-01-01`, to: `${yearA}-12-31` };
  const rangeB =
    mode === "month" ? monthRange(monthB) : { from: `${yearB}-01-01`, to: `${yearB}-12-31` };
  const ym = (s: string, short = false) =>
    /^\d{4}-\d{2}$/.test(s)
      ? short
        ? MONTHS[Number(s.slice(5, 7)) - 1]
        : `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`
      : s;
  const labelA = ym(mode === "month" ? monthA : yearA);
  const labelB = ym(mode === "month" ? monthB : yearB);
  const shortA = ym(mode === "month" ? monthA : yearA, true);
  const shortB = ym(mode === "month" ? monthB : yearB, true);

  const compareQuery = useQuery({
    queryKey: ["stats-compare", rangeA, rangeB, categories],
    queryFn: () => getStatsCompare(rangeA, rangeB, categories),
    placeholderData: keepPreviousData,
  });

  const data = compareQuery.data;
  const delta = data ? data.b.sumMinor - data.a.sumMinor : 0;
  const deltaPct = data && data.a.sumMinor > 0 ? (delta / data.a.sumMinor) * 100 : null;
  const years = [];
  for (let y = THIS_YEAR; y >= 2022; y--) years.push(String(y));

  return (
    <div className="card">
      <div className="card-head">
        <h3>Compare periods</h3>
        <div className="bucket-switch">
          {(["month", "year"] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginBottom: "0.75rem" }}>
        {mode === "month" ? (
          <>
            <input type="month" value={monthA} min="2022-11" onChange={(e) => setMonthA(e.target.value)} />
            <input type="month" value={monthB} min="2022-11" onChange={(e) => setMonthB(e.target.value)} />
          </>
        ) : (
          <>
            <select value={yearA} onChange={(e) => setYearA(e.target.value)}>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <select value={yearB} onChange={(e) => setYearB(e.target.value)}>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {data && (
        <>
          <div className="cmp-summary">
            <div className="cmp-sline">
              <span className="lbl">{labelA}</span>
              <span className="val">
                {fmtAmount(data.a.sumMinor)} <span className="muted">· {data.a.count}</span>
              </span>
            </div>
            <div className="cmp-sline">
              <span className="lbl">{labelB}</span>
              <span className="val">
                {fmtAmount(data.b.sumMinor)} <span className="muted">· {data.b.count}</span>
              </span>
            </div>
            <div className="cmp-sline change">
              <span className="lbl">Change</span>
              <span className={`val ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
                {delta > 0 ? "+" : delta < 0 ? "−" : ""}
                {fmtAmount(Math.abs(delta))}
                {deltaPct !== null && (
                  <span className="pct"> {delta > 0 ? "▲" : "▼"}{Math.abs(deltaPct).toFixed(0)}%</span>
                )}
              </span>
            </div>
          </div>

          <div className="cmp-list">
            {(showAll ? data.byCategory : data.byCategory.slice(0, 8)).map((r) => {
              const cat = catById.get(r.categoryId);
              const d = r.bMinor - r.aMinor;
              return (
                <div className="cmp-row" key={r.categoryId}>
                  <div className="cmp-top">
                    <span className="cmp-name">
                      {cat?.icon ?? "📦"} {cat?.name ?? "Unknown"}
                    </span>
                    <span className={`cmp-delta ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>
                      {d > 0 ? "+" : d < 0 ? "−" : ""}
                      {fmtAmount(Math.abs(d))}
                    </span>
                  </div>
                  <div className="cmp-sub">
                    {shortA}: {fmtAmount(r.aMinor)} → {shortB}: {fmtAmount(r.bMinor)}
                  </div>
                </div>
              );
            })}
          </div>
          {data.byCategory.length > 8 && (
            <button type="button" className="load-more" onClick={() => setShowAll((s) => !s)}>
              {showAll
                ? "Show biggest movers"
                : `Show all ${data.byCategory.length} categories`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
