import { useState } from "react";
import AddExpense from "./screens/AddExpense";
import ExpensesList from "./screens/ExpensesList";
import Categories from "./screens/Categories";

type Tab = "add" | "list" | "categories";

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "add", icon: "➕", label: "Add" },
  { id: "list", icon: "📋", label: "Expenses" },
  { id: "categories", icon: "🏷️", label: "Categories" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("add");

  return (
    <div className="app">
      <div className="screen">
        {tab === "add" && <AddExpense />}
        {tab === "list" && <ExpensesList />}
        {tab === "categories" && <Categories />}
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
