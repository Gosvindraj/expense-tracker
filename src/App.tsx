import { useState } from "react";
import AddExpense from "./screens/AddExpense";
import ExpensesList from "./screens/ExpensesList";
import Stats from "./screens/Stats";
import Categories from "./screens/Categories";
import Import from "./screens/Import";
import type { ExpenseFilters } from "./api";

type Tab = "add" | "list" | "stats" | "categories" | "import";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "add", icon: "➕", label: "Add" },
  { id: "list", icon: "📋", label: "Expenses" },
  { id: "stats", icon: "📊", label: "Stats" },
  { id: "categories", icon: "🏷️", label: "Categories" },
  { id: "import", icon: "📥", label: "Import" },
];

const isTab = (s: string): s is Tab => TABS.some((t) => t.id === s);

export default function App() {
  // deep-linkable tabs: #stats opens Stats, etc.
  const [tab, setTabState] = useState<Tab>(() => {
    const h = window.location.hash.slice(1);
    return isTab(h) ? h : "add";
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
        {tab === "add" && <AddExpense />}
        {tab === "list" && (
          <ExpensesList filters={listFilters} onFiltersChange={setListFilters} />
        )}
        {tab === "stats" && <Stats onOpenExpenses={openExpenses} />}
        {tab === "categories" && <Categories />}
        {tab === "import" && <Import />}
      </div>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
