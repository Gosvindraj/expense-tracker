import { useState } from "react";
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
  const setTab = (t: Tab) => {
    setTabState(t);
    window.history.replaceState(null, "", `#${t}`);
  };

  // lifted so the Stats screen can drill through into a filtered list
  const [listFilters, setListFilters] = useState<ExpenseFilters>({});

  function openExpenses(filters: ExpenseFilters) {
    setListFilters(filters);
    setTab("list");
  }

  return (
    <div className="app">
      <div className="screen">
        {tab === "stats" && <Stats onOpenExpenses={openExpenses} />}
        {tab === "list" && (
          <ExpensesList filters={listFilters} onFiltersChange={setListFilters} />
        )}
        {tab === "add" && <AddExpense />}
        {tab === "plan" && <Plan />}
        {tab === "import" && <Import />}
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
