import { useEffect, useRef, useState } from "react";
import { anySheetOpen } from "./components/Sheet";
import ErrorBoundary from "./components/ErrorBoundary";
import { useOnline } from "./lib/useOnline";
import { onNavigate } from "./lib/nav";
import AddExpense from "./screens/AddExpense";
import ExpensesList from "./screens/ExpensesList";
import Stats from "./screens/Stats";
import Plan from "./screens/Plan";
import Import from "./screens/Import";
import type { ExpenseFilters } from "./api";

type Tab = "stats" | "list" | "add" | "plan" | "import";

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24">
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.5" />
    </svg>
  ),
  data: (
    <svg viewBox="0 0 24 24">
      <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
      <path d="M4 5.5v6c0 1.55 3.58 2.8 8 2.8s8-1.25 8-2.8v-6" />
      <path d="M4 11.5v6c0 1.55 3.58 2.8 8 2.8s8-1.25 8-2.8v-6" />
    </svg>
  ),
};

const isTab = (s: string): s is Tab =>
  ["stats", "list", "add", "plan", "import"].includes(s);

export default function App() {
  // deep-linkable tabs: #stats, #list, #add, #plan, #import (#categories → import)
  const [tab, setTabState] = useState<Tab>(() => {
    const h = window.location.hash.slice(1);
    if (h === "categories") return "import";
    return isTab(h) ? h : "stats";
  });

  /**
   * Current tab in a ref as well as state.
   *
   * The listeners below are registered once, so anything they close over is
   * frozen at first render. A stale `tab` in the guard made setTab a silent
   * no-op whenever the first-render tab happened to match the target — which
   * is exactly how "Manage categories" failed to navigate.
   */
  const tabRef = useRef(tab);

  // each tab switch is a real history entry, so Back walks back through tabs
  // instead of leaving the app
  const setTab = (t: Tab) => {
    if (t === tabRef.current) return;
    tabRef.current = t;
    setTabState(t);
    window.history.pushState({ tab: t }, "", `#${t}`);
  };
  const setTabRef = useRef(setTab);
  setTabRef.current = setTab;

  useEffect(() => {
    window.history.replaceState({ tab: tabRef.current }, "", `#${tabRef.current}`);
    const onPop = (e: PopStateEvent) => {
      // an open sheet absorbs Back to close itself — leave the tab alone
      if (anySheetOpen()) return;
      const t = (e.state as { tab?: string } | null)?.tab ?? window.location.hash.slice(1);
      if (isTab(t)) {
        tabRef.current = t;
        setTabState(t);
      }
    };
    window.addEventListener("popstate", onPop);
    const offNav = onNavigate(({ tab: t }) => setTabRef.current(t));
    return () => {
      window.removeEventListener("popstate", onPop);
      offNav();
    };
  }, []);

  const online = useOnline();

  // lifted so the Stats screen can drill through into a filtered list
  const [listFilters, setListFilters] = useState<ExpenseFilters>({});

  function openExpenses(filters: ExpenseFilters) {
    setListFilters(filters);
    setTab("list");
  }

  return (
    <div className="app">
      {!online && (
        <div className="offline-banner" role="status">
          You're offline — saving is paused until the connection is back.
        </div>
      )}
      {/* all screens stay mounted so filters, drafts, and scroll state
          survive tab switches; only the active one is displayed.
          Each is boundaried so one bad panel can't take the tab bar with it. */}
      <div className="screen" hidden={tab !== "stats"}>
        <ErrorBoundary name="Home">
          <Stats onOpenExpenses={openExpenses} />
        </ErrorBoundary>
      </div>
      <div className="screen" hidden={tab !== "list"}>
        <ErrorBoundary name="List">
          <ExpensesList filters={listFilters} onFiltersChange={setListFilters} />
        </ErrorBoundary>
      </div>
      <div className="screen" hidden={tab !== "add"}>
        <ErrorBoundary name="Add">
          <AddExpense />
        </ErrorBoundary>
      </div>
      <div className="screen" hidden={tab !== "plan"}>
        <ErrorBoundary name="Plan">
          <Plan />
        </ErrorBoundary>
      </div>
      <div className="screen" hidden={tab !== "import"}>
        <ErrorBoundary name="Data">
          <Import />
        </ErrorBoundary>
      </div>
      <nav className="tabbar">
        <button
          type="button"
          className={tab === "stats" ? "active" : ""}
          onClick={() => setTab("stats")}
        >
          {ICONS.home}
          Home
        </button>
        <button
          type="button"
          className={tab === "list" ? "active" : ""}
          onClick={() => setTab("list")}
        >
          {ICONS.list}
          List
        </button>
        <div className="fab-slot">
          <button
            type="button"
            className={`fab ${tab === "add" ? "active" : ""}`}
            aria-label="Add expense"
            onClick={() => setTab("add")}
          >
            {ICONS.plus}
          </button>
        </div>
        <button
          type="button"
          className={tab === "plan" ? "active" : ""}
          onClick={() => setTab("plan")}
        >
          {ICONS.target}
          Plan
        </button>
        <button
          type="button"
          className={tab === "import" ? "active" : ""}
          onClick={() => setTab("import")}
        >
          {ICONS.data}
          Data
        </button>
      </nav>
    </div>
  );
}
