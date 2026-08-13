import { useState } from "react";
import type { Category } from "../../shared/schemas";
import Sheet from "./Sheet";
import Icon from "./Icon";
import { navigate } from "../lib/nav";

/** Bottom-sheet category picker with search. `allowOverall` adds an "Overall" row (id null). */
export default function CategoryPicker({
  categories,
  selectedId,
  allowOverall = false,
  onSelect,
  onClose,
}: {
  categories: Category[];
  selectedId: number | null;
  allowOverall?: boolean;
  onSelect: (id: number | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;

  return (
    <Sheet title="Category" className="picker-sheet" onClose={onClose}>
      <h3>Category</h3>
      <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="picker-grid">
          {allowOverall && !q && (
            <button
              type="button"
              className={`picker-item ${selectedId === null ? "selected" : ""}`}
              onClick={() => onSelect(null)}
            >
              <span className="icon" aria-hidden="true" style={{ background: "var(--surface-3)" }}>
                🌐
              </span>
              <span className="name">Overall</span>
            </button>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`picker-item ${selectedId === c.id ? "selected" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <span className="icon" aria-hidden="true" style={{ background: `${c.color}33` }}>
                {c.icon}
              </span>
              <span className="name">{c.name}</span>
            </button>
          ))}
        {filtered.length === 0 && <p className="muted">No match.</p>}
      </div>
      {/* the moment you most want to edit categories is while picking one */}
      <button
        type="button"
        className="quiet manage-cats"
        onClick={() => {
          onClose();
          navigate("import", "categories");
        }}
      >
        Manage categories <Icon name="chevronRight" />
      </button>
    </Sheet>
  );
}

/** Button that looks like an input and shows the current category; opens the picker. */
export function CategoryField({
  categories,
  value,
  allowOverall = false,
  onChange,
}: {
  categories: Category[];
  value: number | null;
  allowOverall?: boolean;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value !== null ? categories.find((c) => c.id === value) : null;
  return (
    <>
      <button type="button" className="cat-field" onClick={() => setOpen(true)}>
        <span className="cat-field-label">
          {selected
            ? `${selected.icon} ${selected.name}`
            : allowOverall && value === null
              ? "🌐 Overall"
              : "Choose category"}
        </span>
        <svg viewBox="0 0 24 24" className="chev">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <CategoryPicker
          categories={categories}
          selectedId={value}
          allowOverall={allowOverall}
          onSelect={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
