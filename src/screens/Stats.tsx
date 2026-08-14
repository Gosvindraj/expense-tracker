import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
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
import { usePersistedState } from "../lib/usePersistedState";
import Sheet from "../components/Sheet";
import Icon from "../components/Icon";
import { DateField, MonthField, SelectField } from "../components/Field";

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
    <Sheet title="Period" className="picker-sheet" onClose={onClose}>
      <h3>Period</h3>
      <div className="sheet-rows">
          {rows.map(([key, label]) => (
            <button key={key} type="button" className="sheet-row" onClick={() => onPick(key)}>
              <span>{label}</span>
              {current === key && <Icon name="check" className="check" />}
            </button>
          ))}
          <button
            type="button"
            className="sheet-row"
            onClick={() => setCustomOpen((o) => !o)}
          >
            <span>Custom range</span>
            {current === "custom" && <Icon name="check" className="check" />}
          </button>
          {customOpen && (
            <div className="sheet-custom">
              <div className="row">
                <DateField label="From" value={from} onChange={setFrom} />
                <DateField label="To" value={to} onChange={setTo} />
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
    </Sheet>
  );
}

// ---------- main screen ----------

export default function Stats({
  onOpenExpenses,
}: {
  onOpenExpenses: (f: ExpenseFilters) => void;
}) {
  // these survive a reload — see usePersistedState
  const [preset, setPreset] = usePersistedState("stats.preset", "this-month");
  const [customFrom, setCustomFrom] = usePersistedState("stats.customFrom", "");
  const [customTo, setCustomTo] = usePersistedState("stats.customTo", "");
  const [catFilter, setCatFilter] = usePersistedState<number[]>("stats.categories", []);
  const [catsOpen, setCatsOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [share, setShare] = useState<"bars" | "donut">("bars");

  // chart drill-down zoom: year → months → days, with a back trail
  type ZoomFrame = { preset: string; customFrom: string; customTo: string; bucket: Bucket | null };
  const [zoomStack, setZoomStack] = useState<ZoomFrame[]>([]);

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

  // Years come from the data, not a hardcoded floor. The old `y >= 2022` both
  // listed empty years forever and hid anything older.
  const boundsQuery = useQuery({
    queryKey: ["stats-summary", {}],
    queryFn: () => getStatsSummary({}),
    staleTime: 5 * 60_000,
  });
  const years = useMemo(() => {
    const first = Number(boundsQuery.data?.minDay?.slice(0, 4)) || THIS_YEAR;
    const last = Math.max(Number(boundsQuery.data?.maxDay?.slice(0, 4)) || THIS_YEAR, THIS_YEAR);
    const ys = [];
    for (let y = last; y >= first; y--) ys.push(y);
    return ys;
  }, [boundsQuery.data]);

  const drill = (extra: { from?: string; to?: string; categories?: number[] }) =>
    onOpenExpenses({
      from: extra.from ?? range.from,
      to: extra.to ?? range.to,
      categories: extra.categories ?? (catFilter.length ? catFilter : undefined),
    });

  const stale = summaryQuery.isPlaceholderData || byCategoryQuery.isPlaceholderData;

  return (
    <div className={`stats-screen ${stale ? "stale" : ""}`}>
      <h2>Overview</h2>
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
            setZoomStack([]);
            setPeriodOpen(false);
          }}
          onApplyCustom={(f, t) => {
            setCustomFrom(f);
            setCustomTo(t);
            setPreset("custom");
            setBucketOverride(null);
            setZoomStack([]);
            setPeriodOpen(false);
          }}
          onClose={() => setPeriodOpen(false)}
        />
      )}
      {catsOpen && (
        <div className="filter-cats stats-cat-filter">
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
              <Icon name="close" /> Clear
            </button>
          )}
        </div>
      )}

      {/* ---- KPI tiles ---- */}
      <div className="kpi-row">
        <div className="stat-tile">
          <span className="stat-label">Total spent</span>
          {summaryQuery.isLoading ? (
            <span className="sk sk-line sk-kpi" />
          ) : (
            <span className="stat-value">{fmtAmount(summary?.sumMinor ?? 0)}</span>
          )}
          {deltaPct !== null && (
            <span className={`stat-delta ${deltaPct > 0 ? "up" : "down"}`}>
              <Icon name={deltaPct > 0 ? "arrowUp" : "arrowDown"} />{" "}
              {Math.abs(deltaPct).toFixed(0)}% vs previous
            </span>
          )}
        </div>
        <div className="stat-tile">
          <span className="stat-label">Expenses</span>
          {summaryQuery.isLoading ? (
            <span className="sk sk-line sk-kpi narrow" />
          ) : (
            <span className="stat-value">{summary?.count ?? 0}</span>
          )}
        </div>
        <div className="stat-tile">
          <span className="stat-label">Avg / day</span>
          {summaryQuery.isLoading ? (
            <span className="sk sk-line sk-kpi" />
          ) : (
            <span className="stat-value">{fmtAmount(avgPerDay)}</span>
          )}
        </div>
      </div>

      {/* ---- insights ---- */}
      <Insights
        series={series}
        bucket={bucket}
        // a bucket switch refetches the timeseries; keepPreviousData means
        // isLoading stays false, so the peak card would show the old period's
        // answer until the new one lands
        peakLoading={timeseriesQuery.isPlaceholderData || timeseriesQuery.isFetching}
        byCategory={byCategoryQuery.data ?? []}
        catById={catById}
        summary={summary}
        loading={summaryQuery.isLoading || byCategoryQuery.isLoading}
        onOpenBucket={(key) => drill(bucketToRange(key, bucket))}
        onOpenCategory={(id) => drill({ categories: [id] })}
      />

      {/* ---- spending over time ---- */}
      <div className="card">
        <div className="card-head">
          <h3>Spending</h3>
          <div className="bucket-switch">
            {(["day", "month", "year"] as Bucket[]).map((b) => (
              <button
                key={b}
                type="button"
                className={bucket === b ? "on" : ""}
                onClick={() => setBucketOverride(b)}
              >
                {b[0].toUpperCase() + b.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {zoomStack.length > 0 && (
          <button
            type="button"
            className="zoom-back"
            onClick={() => {
              const prev = zoomStack[zoomStack.length - 1];
              setZoomStack((s) => s.slice(0, -1));
              setPreset(prev.preset);
              setCustomFrom(prev.customFrom);
              setCustomTo(prev.customTo);
              setBucketOverride(prev.bucket);
            }}
          >
            <Icon name="chevronLeft" /> Back to {periodLabel(
              zoomStack[zoomStack.length - 1].preset,
              zoomStack[zoomStack.length - 1].customFrom,
              zoomStack[zoomStack.length - 1].customTo,
            )}
          </button>
        )}
        <ColumnChart
          points={series}
          bucket={bucket}
          loading={timeseriesQuery.isLoading}
          onView={(key) => drill(bucketToRange(key, bucket))}
          onZoom={
            bucket === "day"
              ? undefined
              : (key) => {
                  setZoomStack((s) => [
                    ...s,
                    { preset, customFrom, customTo, bucket: bucketOverride },
                  ]);
                  if (bucket === "year") {
                    setPreset(`year-${key}`);
                    setBucketOverride("month");
                  } else {
                    const r = monthRange(key);
                    setCustomFrom(r.from);
                    setCustomTo(r.to);
                    setPreset("custom");
                    setBucketOverride("day");
                  }
                }
          }
        />
      </div>

      {/* ---- by category ---- */}
      <div className="card">
        <div className="card-head">
          <h3>By category</h3>
          <div className="bucket-switch">
            {(["bars", "donut"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={share === m ? "on" : ""}
                onClick={() => setShare(m)}
              >
                {m === "bars" ? "Bars" : "Share"}
              </button>
            ))}
          </div>
        </div>
        {share === "donut" && (
          <CategoryDonut
            stats={byCategoryQuery.data ?? []}
            catById={catById}
            totalMinor={summary?.sumMinor ?? 0}
            onSliceClick={(id) => drill({ categories: [id] })}
          />
        )}
        <CategoryTable
          stats={byCategoryQuery.data ?? []}
          catById={catById}
          totalMinor={summary?.sumMinor ?? 0}
          loading={byCategoryQuery.isLoading}
          onRowClick={(id) => drill({ categories: [id] })}
        />
      </div>

      {/* ---- compare ---- */}
      <Compare catById={catById} categories={filters.categories} yearOptions={years} />
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

const MIN_BAND = 16; // px per bar — below this the chart scrolls instead of shrinking

function ColumnChart({
  points,
  bucket,
  loading = false,
  onView,
  onZoom,
}: {
  points: TimeseriesPoint[];
  bucket: Bucket;
  loading?: boolean;
  onView: (bucketKey: string) => void;
  onZoom?: (bucketKey: string) => void;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const [hover, setHover] = useState<number | null>(null); // mouse, transient
  const [selected, setSelected] = useState<number | null>(null); // tap, pinned
  const [scrollLeft, setScrollLeft] = useState(0);

  /** Bucket key at the centre of the viewport, so granularity changes keep their place. */
  const anchorRef = useRef<string | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipW, setTipW] = useState(0);

  const onScroll = (el: HTMLDivElement) => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setScrollLeft(el.scrollLeft);
      const n = points.length;
      if (n > 0) {
        const band = (Math.max(0, el.scrollWidth - 46) || 1) / n;
        const centre = Math.floor((el.scrollLeft + el.clientWidth / 2 - 40) / band);
        anchorRef.current = points[Math.min(n - 1, Math.max(0, centre))]?.bucket ?? null;
      }
    });
  };

  const n = points.length;
  const H = 200;
  const M = { top: 10, right: 6, bottom: 22, left: 40 };
  const innerW = Math.max(0, width - M.left - M.right);
  const chartInnerW = Math.max(innerW, n * MIN_BAND);
  const chartW = chartInnerW + M.left + M.right;
  const scrollable = chartInnerW > innerW;
  const innerH = H - M.top - M.bottom;

  /**
   * New data = new bars. Previously this always slammed the scroll to the far
   * right, so switching day→month threw away where you were looking. Now we
   * remember the date at the centre of the viewport and restore it, falling
   * back to "most recent" only when there's nothing to anchor to.
   */
  useEffect(() => {
    setHover(null);
    setSelected(null);
    const el = scrollRef.current;
    if (!el) return;
    const anchor = anchorRef.current;
    if (anchor && points.length) {
      // bucket keys nest by prefix: '2026-07-16' → '2026-07' → '2026'
      const idx = points.findIndex((p) => {
        const n = Math.min(p.bucket.length, anchor.length);
        return p.bucket.slice(0, n) === anchor.slice(0, n);
      });
      if (idx !== -1) {
        const band = chartInnerW / points.length;
        el.scrollLeft = Math.max(0, M.left + idx * band + band / 2 - el.clientWidth / 2);
        setScrollLeft(el.scrollLeft);
        return;
      }
    }
    el.scrollLeft = el.scrollWidth;
    setScrollLeft(el.scrollLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, chartW]);

  if (n === 0) {
    // an empty cache mid-fetch is not the same as an empty range
    return (
      <div ref={ref} className="chart-empty muted">
        {loading ? <span className="sk sk-chart" /> : "No data in this range."}
      </div>
    );
  }

  const band = chartInnerW / n;
  // y-scale follows the bars currently in view, not the all-time peak
  const visStart = Math.max(0, Math.floor((scrollLeft - M.left) / band));
  const visEnd = Math.min(n - 1, Math.ceil((scrollLeft + width - M.left) / band));
  let visMax = 0;
  for (let i = visStart; i <= visEnd; i++) visMax = Math.max(visMax, points[i]?.sumMinor ?? 0);
  const maxV = niceCeil(Math.max(visMax, 1));
  const yTicks = [0, maxV / 2, maxV];
  const barW = Math.max(2, Math.min(24, band * 0.72));
  const y = (v: number) => M.top + innerH * (1 - Math.min(1, v / maxV));
  const labelEvery = Math.max(1, Math.ceil(48 / band));
  const barR = Math.min(4, barW / 2);

  /**
   * A chart is a picture to a screen reader unless you describe it.
   *
   * The keyboard navigation below is desktop-only value, but this summary is
   * what VoiceOver reads on the phone this app actually runs on — turning an
   * unlabelled graphic into the three facts the bars are conveying.
   */
  const seriesSummary = (() => {
    if (n === 0) return "Spending over time: no data";
    const total = points.reduce((sum, p) => sum + p.sumMinor, 0);
    const peak = points.reduce((b, p) => (p.sumMinor > b.sumMinor ? p : b), points[0]);
    return (
      `Spending by ${bucket}, ${n} ${bucket}s. ` +
      `Total ${fmtAmount(total)}. ` +
      `Highest ${bucketLabel(peak.bucket, bucket)} at ${fmtAmount(peak.sumMinor)}. ` +
      `Use arrow keys to step through, Enter to open.`
    );
  })();

  function onChartKey(e: React.KeyboardEvent) {
    if (n === 0) return;
    const cur = selected ?? 0;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = Math.min(n - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
      setSelected(next);
      const el = scrollRef.current;
      if (el) {
        const band = chartInnerW / n;
        el.scrollLeft = Math.max(0, M.left + next * band + band / 2 - el.clientWidth / 2);
      }
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setSelected(e.key === "Home" ? 0 : n - 1);
    } else if (e.key === "Enter" && selected !== null && points[selected].sumMinor > 0) {
      e.preventDefault();
      onView(points[selected].bucket);
    }
  }

  const activeIdx = selected ?? hover;
  const active = activeIdx !== null ? points[activeIdx] : null;
  const activeX = activeIdx !== null ? M.left + activeIdx * band + band / 2 - scrollLeft : 0;

  // measure the tooltip so the clamp uses its real width
  if (tipRef.current && tipRef.current.offsetWidth !== tipW) {
    queueMicrotask(() => setTipW(tipRef.current?.offsetWidth ?? 0));
  }

  return (
    <div ref={ref} className="chart-wrap">
      {width > 0 && (
        <>
          <div
            className="chart-scroll"
            ref={scrollRef}
            onScroll={(e) => onScroll(e.currentTarget)}
          >
            <svg
              width={chartW}
              height={H}
              role="img"
              aria-label={seriesSummary}
              tabIndex={0}
              onKeyDown={onChartKey}
            >
              <defs>
                {/* clip at the baseline: bars extend below it so only their tops read as rounded */}
                <clipPath id="plot-clip">
                  <rect x="0" y="0" width={chartW} height={y(0)} />
                </clipPath>
              </defs>
              {yTicks.map((_, idx) => (
                <line
                  key={idx}
                  x1={M.left}
                  x2={chartW - M.right}
                  y1={M.top + (innerH / 2) * (2 - idx)}
                  y2={M.top + (innerH / 2) * (2 - idx)}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
              ))}
              {points.map((p, i) => {
                const x = M.left + i * band + (band - barW) / 2;
                const yTop = y(p.sumMinor);
                return (
                  <g key={p.bucket}>
                    {p.sumMinor > 0 && (
                      <rect
                        className="bar"
                        clipPath="url(#plot-clip)"
                        x={x}
                        y={yTop}
                        width={barW}
                        height={Math.max(0, y(0) - yTop) + barR}
                        rx={barR}
                        fill={activeIdx === i ? "var(--accent-hover)" : "var(--accent)"}
                      />
                    )}
                    {/* full-height hit target; zero bars are inert */}
                    <rect
                      x={M.left + i * band}
                      y={M.top}
                      width={band}
                      height={innerH}
                      fill="transparent"
                      style={{ cursor: p.sumMinor > 0 ? "pointer" : "default" }}
                      onPointerEnter={(e) => {
                        if (p.sumMinor > 0 && e.pointerType === "mouse") setHover(i);
                      }}
                      onPointerLeave={(e) => {
                        if (e.pointerType === "mouse") setHover((h) => (h === i ? null : h));
                      }}
                      onPointerUp={() => {
                        setSelected(p.sumMinor > 0 ? i : null);
                      }}
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
          </div>
          {/* y-axis labels pinned while the plot scrolls underneath */}
          <svg className="yaxis-pin" width={M.left} height={H}>
            {yTicks.map((t) => (
              <text key={t} x={M.left - 6} y={y(t) + 3.5} textAnchor="end" className="tick-text pinned">
                {tickLabel(t)}
              </text>
            ))}
          </svg>
          {scrollable && <div className="chart-scroll-hint">
              <Icon name="chevronLeft" /> swipe <Icon name="chevronRight" />
            </div>}
        </>
      )}
      {active && active.sumMinor > 0 && (
        <div
          ref={tipRef}
          className="chart-tooltip actions"
          style={{
            // clamp against the tooltip's measured width rather than a guessed
            // 92px, so it can't hang off the edge on a narrow screen
            left: `${Math.min(Math.max(activeX, tipW / 2 + 6), Math.max(width - tipW / 2 - 6, tipW / 2 + 6))}px`,
          }}
        >
          <span className="tt-value">{fmtAmount(active.sumMinor)}</span>
          <span className="tt-label">
            {bucketLabel(active.bucket, bucket)} · {active.count} expense
            {active.count === 1 ? "" : "s"}
          </span>
          <span className="tt-actions">
            {onZoom && (
              <button type="button" onClick={() => onZoom(active.bucket)}>
                Zoom in
              </button>
            )}
            <button type="button" onClick={() => onView(active.bucket)}>
              View <Icon name="chevronRight" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

// ---------- insights ----------

/**
 * Three readings the raw totals don't give you, each a shortcut into the list.
 * Everything here is derived from queries the screen already runs — no extra
 * round-trips just to say something.
 */
function Insights({
  series,
  bucket,
  peakLoading = false,
  byCategory,
  catById,
  summary,
  loading = false,
  onOpenBucket,
  onOpenCategory,
}: {
  series: TimeseriesPoint[];
  bucket: Bucket;
  peakLoading?: boolean;
  byCategory: { categoryId: number; sumMinor: number; count: number }[];
  catById: Map<number, Category>;
  summary: { sumMinor: number; count: number } | undefined;
  loading?: boolean;
  onOpenBucket: (key: string) => void;
  onOpenCategory: (id: number) => void;
}) {
  const peak = useMemo(
    () => series.reduce<TimeseriesPoint | null>((b, p) => (!b || p.sumMinor > b.sumMinor ? p : b), null),
    [series],
  );
  const top = byCategory[0];

  // the row reserves its height rather than appearing late and shoving the
  // chart down the screen
  if (loading) {
    return (
      <div className="insights">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="insight static">
            <span className="sk sk-line sk-insight narrow" />
            <span className="sk sk-line sk-insight" />
            <span className="sk sk-line sk-insight narrow" />
          </div>
        ))}
      </div>
    );
  }
  if (!summary || summary.count === 0) return null;

  const bucketWord = bucket === "day" ? "day" : bucket === "month" ? "month" : "year";
  const perExpense = Math.round(summary.sumMinor / summary.count);
  const topPct = summary.sumMinor > 0 && top ? (top.sumMinor / summary.sumMinor) * 100 : 0;
  const cat = top ? catById.get(top.categoryId) : undefined;

  return (
    <div className="insights">
      {top && (
        <button type="button" className="insight" onClick={() => onOpenCategory(top.categoryId)}>
          <span className="insight-label">Biggest category</span>
          <span className="insight-value">
            <span aria-hidden="true">{cat?.icon ?? "📦"}</span> {cat?.name ?? "Unknown"}
          </span>
          <span className="insight-sub">
            {fmtAmount(top.sumMinor)} · {topPct.toFixed(0)}% of total
          </span>
        </button>
      )}
      {peakLoading ? (
        <div className="insight static">
          <span className="insight-label">Heaviest {bucketWord}</span>
          <span className="sk sk-line sk-insight" />
          <span className="sk sk-line sk-insight narrow" />
        </div>
      ) : (
        peak &&
        peak.sumMinor > 0 && (
          <button type="button" className="insight" onClick={() => onOpenBucket(peak.bucket)}>
            <span className="insight-label">Heaviest {bucketWord}</span>
            <span className="insight-value">{bucketLabel(peak.bucket, bucket)}</span>
            <span className="insight-sub">
              {fmtAmount(peak.sumMinor)} · {peak.count} expense{peak.count === 1 ? "" : "s"}
            </span>
          </button>
        )
      )}
      <div className="insight static">
        <span className="insight-label">Average expense</span>
        <span className="insight-value">{fmtAmount(perExpense)}</span>
        <span className="insight-sub">across {summary.count} expenses</span>
      </div>
    </div>
  );
}

// ---------- category share (donut) ----------

const TAU = Math.PI * 2;

/**
 * Share of spend as a donut. The bar table answers "how much per category";
 * this answers "how is the total divided", which the bars only imply.
 * Slices below 2% are pooled so the ring doesn't turn into hairlines.
 */
function CategoryDonut({
  stats,
  catById,
  totalMinor,
  onSliceClick,
}: {
  stats: { categoryId: number; sumMinor: number; count: number }[];
  catById: Map<number, Category>;
  totalMinor: number;
  onSliceClick: (categoryId: number) => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (totalMinor <= 0 || stats.length === 0) return null;

  const MIN_SHARE = 0.02;
  const big = stats.filter((s) => s.sumMinor / totalMinor >= MIN_SHARE);
  const restMinor = stats
    .filter((s) => s.sumMinor / totalMinor < MIN_SHARE)
    .reduce((n, s) => n + s.sumMinor, 0);

  const slices = [
    ...big.map((s) => ({
      id: s.categoryId,
      minor: s.sumMinor,
      color: catById.get(s.categoryId)?.color ?? "#8a8f98",
      label: `${catById.get(s.categoryId)?.icon ?? "📦"} ${catById.get(s.categoryId)?.name ?? "Unknown"}`,
    })),
    ...(restMinor > 0
      ? [{ id: -1, minor: restMinor, color: "#5b6070", label: "Everything else" }]
      : []),
  ];

  const SIZE = 190;
  const R = 74;
  const STROKE = 26;
  const c = SIZE / 2;
  let angle = -Math.PI / 2; // start at 12 o'clock

  const arcs = slices.map((s) => {
    const sweep = (s.minor / totalMinor) * TAU;
    const x1 = c + R * Math.cos(angle);
    const y1 = c + R * Math.sin(angle);
    angle += sweep;
    const x2 = c + R * Math.cos(angle);
    const y2 = c + R * Math.sin(angle);
    return {
      ...s,
      d: `M ${x1} ${y1} A ${R} ${R} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2}`,
      pct: (s.minor / totalMinor) * 100,
    };
  });

  const shown = active !== null ? arcs.find((a) => a.id === active) : null;

  return (
    <div className="donut-wrap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="donut" role="img" aria-label="Share of spending by category">
        {arcs.map((a) => (
          <path
            key={a.id}
            d={a.d}
            stroke={a.color}
            strokeWidth={active === a.id ? STROKE + 6 : STROKE}
            fill="none"
            className="donut-arc"
            onPointerEnter={() => setActive(a.id)}
            onPointerLeave={() => setActive((v) => (v === a.id ? null : v))}
            onClick={() => a.id !== -1 && onSliceClick(a.id)}
          />
        ))}
        <text x={c} y={c - 4} textAnchor="middle" className="donut-total">
          {shown ? `${shown.pct.toFixed(1)}%` : fmtAmount(totalMinor)}
        </text>
        <text x={c} y={c + 15} textAnchor="middle" className="donut-sub">
          {shown ? fmtAmount(shown.minor) : "total"}
        </text>
      </svg>
      <div className="donut-legend">
        {arcs.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`donut-key ${active === a.id ? "on" : ""}`}
            onPointerEnter={() => setActive(a.id)}
            onPointerLeave={() => setActive(null)}
            onClick={() => a.id !== -1 && onSliceClick(a.id)}
          >
            <span className="dot-sm" style={{ background: a.color }} aria-hidden="true" />
            <span className="donut-key-label">{a.label}</span>
            <span className="donut-key-pct">{a.pct.toFixed(0)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- category breakdown (table with inline bars) ----------

function CategoryTable({
  stats,
  catById,
  totalMinor,
  loading = false,
  onRowClick,
}: {
  stats: { categoryId: number; sumMinor: number; count: number }[];
  catById: Map<number, Category>;
  totalMinor: number;
  loading?: boolean;
  onRowClick: (categoryId: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (loading && stats.length === 0) {
    return (
      <div className="cat-table">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="sk sk-cat-row" />
        ))}
      </div>
    );
  }
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
  yearOptions,
}: {
  catById: Map<number, Category>;
  categories?: number[];
  yearOptions: number[];
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
  const years = yearOptions.map(String);
  // earliest selectable month follows the data, like the year list
  const monthFloor = `${yearOptions[yearOptions.length - 1] ?? THIS_YEAR}-01`;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Compare periods</h3>
        <div className="bucket-switch">
          {(["month", "year"] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="row cmp-pickers">
        {mode === "month" ? (
          <>
            <MonthField label="Period A" value={monthA} min={monthFloor} onChange={setMonthA} />
            <MonthField label="Period B" value={monthB} min={monthFloor} onChange={setMonthB} />
          </>
        ) : (
          <>
            <SelectField
              label="Period A"
              title="Year"
              value={yearA}
              options={years.map((y) => ({ value: y, label: y }))}
              onChange={setYearA}
            />
            <SelectField
              label="Period B"
              title="Year"
              value={yearB}
              options={years.map((y) => ({ value: y, label: y }))}
              onChange={setYearB}
            />
          </>
        )}
      </div>

      {compareQuery.isLoading && (
        <>
          <div className="sk sk-line sk-kpi" />
          <div className="sk sk-cat-row" />
          <div className="sk sk-cat-row" />
        </>
      )}

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
                  <span className="pct">
                    <Icon name={delta > 0 ? "arrowUp" : "arrowDown"} />
                    {Math.abs(deltaPct).toFixed(0)}%
                  </span>
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
