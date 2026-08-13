import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCategories, createCategory, updateCategory, deleteCategory } from "../api";
import type { Category } from "../../shared/schemas";
import ConfirmSheet from "../components/ConfirmSheet";
import Sheet from "../components/Sheet";
import Icon from "../components/Icon";
import { useToast } from "../components/Toast";
import ErrorNote from "../components/ErrorNote";

const PALETTE = [
  "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#d946ef", "#8b5cf6",
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#eab308", "#8a8f98",
];

/** Readable names so the colour dots don't announce as hex codes. */
const COLOR_NAMES: Record<string, string> = {
  "#f59e0b": "Amber", "#f97316": "Orange", "#ef4444": "Red",
  "#ec4899": "Pink", "#d946ef": "Fuchsia", "#8b5cf6": "Violet",
  "#6366f1": "Indigo", "#3b82f6": "Blue", "#06b6d4": "Cyan",
  "#10b981": "Emerald", "#84cc16": "Lime", "#eab308": "Yellow",
  "#8a8f98": "Grey",
};

const EMOJIS = [
  "🍔", "🍕", "🍜", "🍣", "☕", "🍺", "🛒", "🥦", "🍎", "🎂",
  "🚗", "⛽", "🅿️", "🚌", "🚕", "✈️", "🏝️", "🏠", "🏡", "💡",
  "🌐", "📱", "💻", "🎮", "🎬", "🎵", "🎨", "📚", "🏋️", "⚽",
  "🧘", "💆", "💇", "💊", "🩺", "🐶", "🐱", "👕", "👟", "💍",
  "🎁", "❤️", "🎉", "👶", "🧾", "💼", "🎓", "✏️", "🔧", "🧰",
  "🧴", "🧻", "🪑", "🛏️", "📦", "💸", "🏦", "💳", "🎰", "🚬",
];

/** Search terms per icon — the grid is only browsable up to about 20 items. */
const EMOJI_TERMS: Record<string, string> = {
  "🍔": "burger food fast", "🍕": "pizza food", "🍜": "noodles ramen food",
  "🍣": "sushi food japanese", "☕": "coffee cafe drink", "🍺": "beer alcohol drink",
  "🛒": "groceries shopping cart", "🥦": "vegetables greens groceries", "🍎": "fruit apple",
  "🎂": "cake birthday dessert", "🚗": "car vehicle transport", "⛽": "fuel petrol gas",
  "🅿️": "parking car", "🚌": "bus transport", "🚕": "taxi grab transport",
  "✈️": "flight plane travel", "🏝️": "holiday beach travel", "🏠": "home house rent",
  "🏡": "house home garden", "💡": "electricity utilities power", "🌐": "internet web online",
  "📱": "phone mobile", "💻": "laptop computer", "🎮": "games gaming", "🎬": "movie cinema film",
  "🎵": "music streaming spotify", "🎨": "art hobby", "📚": "books reading education",
  "🏋️": "gym fitness sport", "⚽": "football sport", "🧘": "yoga wellness",
  "💆": "massage spa", "💇": "haircut salon", "💊": "medicine pharmacy health",
  "🩺": "doctor health medical", "🐶": "dog pet", "🐱": "cat pet", "👕": "clothes shirt",
  "👟": "shoes sneakers", "💍": "jewellery ring", "🎁": "gift present", "❤️": "charity love donation",
  "🎉": "party celebration", "👶": "baby child kids", "🧾": "receipt bills tax",
  "💼": "work business", "🎓": "education tuition school", "✏️": "stationery pencil",
  "🔧": "repair tools maintenance", "🧰": "toolbox hardware", "🧴": "toiletries lotion",
  "🧻": "household supplies", "🪑": "furniture chair", "🛏️": "bed furniture",
  "📦": "misc other package", "💸": "money cash spending", "🏦": "bank finance",
  "💳": "card credit payment", "🎰": "gambling lottery", "🚬": "cigarettes tobacco",
};

function EmojiSheet({
  current,
  onSelect,
  onClose,
}: {
  current: string;
  onSelect: (e: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState("");
  const term = q.trim().toLowerCase();
  const filtered = term
    ? EMOJIS.filter((e) => (EMOJI_TERMS[e] ?? "").includes(term) || e === term)
    : EMOJIS;

  return (
    <Sheet title="Icon" className="picker-sheet" onClose={onClose}>
      <h3>Icon</h3>
      <input
        placeholder="Search icons…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search icons"
      />
      <div className="emoji-grid">
        {filtered.map((e) => (
          <button
            key={e}
            type="button"
            className={`emoji-cell ${current === e ? "on" : ""}`}
            aria-label={EMOJI_TERMS[e]?.split(" ")[0] ?? "icon"}
            onClick={() => onSelect(e)}
          >
            {e}
          </button>
        ))}
        {filtered.length === 0 && <p className="muted">No match — paste any emoji below.</p>}
      </div>
      {/* 60 built-ins can't cover everything; let any emoji through */}
      <div className="row emoji-custom">
        <input
          value={custom}
          onChange={(e) => setCustom([...e.target.value].slice(-2).join(""))}
          placeholder="Or paste any emoji"
          aria-label="Custom emoji"
        />
        <button
          type="button"
          className="primary"
          disabled={!custom.trim()}
          onClick={() => onSelect(custom.trim())}
        >
          Use
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Colour picker: a swatch for any colour, then thirteen presets.
 *
 * The swatch is the control of record — 21 of 33 categories arrived from the
 * import with colours outside the palette, and without it those were a one-way
 * door. The dots are just shortcuts to the house palette.
 *
 * An earlier version also prepended the current colour as a 14th dot, so an
 * off-palette category had something ringed. The swatch shows that colour
 * already, so the extra dot was a third thing displaying the same state.
 */
function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-dots">
      <input
        type="color"
        className="color-custom"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Custom colour"
        title="Pick any colour"
      />
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={COLOR_NAMES[c] ?? c}
          aria-pressed={value === c}
          className={`dot ${value === c ? "on" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export default function Categories() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const [editing, setEditing] = useState<Category | null>(null);
  const [confirmCat, setConfirmCat] = useState<Category | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["categories"] });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      updateCategory(id, { archived }),
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCategory(id),
    onSuccess: () => {
      invalidate();
      setConfirmCat(null);
      toast({ message: "Category deleted" });
    },
  });

  const cats = categoriesQuery.data ?? [];
  const active = useMemo(
    () =>
      [...cats.filter((c) => !c.archived)].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [cats],
  );
  const archived = cats.filter((c) => c.archived);

  /**
   * Move a category one place up or down.
   *
   * Positions are renumbered in tens and only the rows whose number actually
   * changed get written. Seeded categories share values (10, 20, …) and new
   * ones were all hardcoded to 999, so swapping two sortOrders wasn't reliable
   * — the first move renumbers, later ones touch two rows.
   */
  const reorder = useMutation({
    mutationFn: async ({ id, dir }: { id: number; dir: -1 | 1 }) => {
      const i = active.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= active.length) return;
      const next = [...active];
      [next[i], next[j]] = [next[j], next[i]];
      for (const [idx, c] of next.entries()) {
        const want = (idx + 1) * 10;
        if (c.sortOrder !== want) await updateCategory(c.id, { sortOrder: want });
      }
    },
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="cats-screen">
      <CreateForm onDone={invalidate} nextSortOrder={(active.length + 1) * 10} />
      <ErrorNote error={err} />

      {categoriesQuery.isLoading && (
        <ul className="cat-list" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <span className="row-btn">
                <span className="icon sk" />
                <span className="mid">
                  <span className="sk sk-line sk-w38" />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ul className="cat-list">
        {active.map((c, i) => (
          <li key={c.id} className="reorder-row">
            <button type="button" className="row-btn" onClick={() => setEditing(c)}>
              <span className="icon" aria-hidden="true" style={{ background: `${c.color}33` }}>
                {c.icon}
              </span>
              <span className="mid">{c.name}</span>
              <Icon name="chevronRight" className="row-chev" />
            </button>
            <span className="reorder-actions">
              <button
                type="button"
                className="icon-act"
                aria-label={`Move ${c.name} up`}
                disabled={i === 0 || reorder.isPending}
                onClick={() => reorder.mutate({ id: c.id, dir: -1 })}
              >
                <Icon name="arrowUp" />
              </button>
              <button
                type="button"
                className="icon-act"
                aria-label={`Move ${c.name} down`}
                disabled={i === active.length - 1 || reorder.isPending}
                onClick={() => reorder.mutate({ id: c.id, dir: 1 })}
              >
                <Icon name="arrowDown" />
              </button>
            </span>
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <>
          <h3 className="muted">Archived</h3>
          <ul className="cat-list archived">
            {archived.map((c) => (
              <li key={c.id}>
                <button type="button" className="row-btn" onClick={() => setEditing(c)}>
                  <span className="icon" aria-hidden="true">{c.icon}</span>
                  <span className="mid">{c.name}</span>
                  <Icon name="chevronRight" className="row-chev" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {confirmCat && (
        <ConfirmSheet
          title={`Delete "${confirmCat.name}"?`}
          message="Only possible if it has no expenses."
          pending={deleteMutation.isPending}
          error={deleteMutation.error?.message}
          onConfirm={() => deleteMutation.mutate(confirmCat.id)}
          onClose={() => {
            deleteMutation.reset();
            setConfirmCat(null);
          }}
        />
      )}

      {editing && (
        <EditCategoryModal
          category={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            invalidate();
            setEditing(null);
            toast({ message: "Category updated" });
          }}
          onToggleArchive={() => {
            archiveMutation.mutate({ id: editing.id, archived: !editing.archived });
            setEditing(null);
          }}
          onRequestDelete={() => {
            setEditing(null);
            setConfirmCat(editing);
          }}
        />
      )}
    </div>
  );
}

function CreateForm({ onDone, nextSortOrder }: { onDone: () => void; nextSortOrder: number }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState("#8a8f98");
  const [err, setErr] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      createCategory({ name: name.trim(), icon, color, parentId: null, sortOrder: nextSortOrder }),
    onSuccess: () => {
      setName("");
      setErr(null);
      onDone();
    },
    onError: (e: Error) => setErr(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("Name is required");
    createMutation.mutate();
  }

  return (
    <form className="cat-create" onSubmit={submit}>
      <div className="cat-create-row">
        <button type="button" className="icon-btn" onClick={() => setEmojiOpen(true)}>
          {icon || "📦"}
        </button>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" maxLength={60} />
        <button type="submit" className="primary" disabled={createMutation.isPending}>Add</button>
      </div>
      <ColorDots value={color} onChange={setColor} />
      <ErrorNote error={err} />
      {emojiOpen && (
        <EmojiSheet
          current={icon}
          onSelect={(e) => {
            setIcon(e);
            setEmojiOpen(false);
          }}
          onClose={() => setEmojiOpen(false)}
        />
      )}
    </form>
  );
}

function EditCategoryModal({
  category,
  onClose,
  onDone,
  onToggleArchive,
  onRequestDelete,
}: {
  category: Category;
  onClose: () => void;
  onDone: () => void;
  onToggleArchive: () => void;
  onRequestDelete: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon);
  const [color, setColor] = useState(category.color);
  const [err, setErr] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const dirty =
    name !== category.name || icon !== category.icon || color !== category.color;

  const saveMutation = useMutation({
    mutationFn: () => updateCategory(category.id, { name: name.trim(), icon, color }),
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Sheet title="Edit category" onClose={onClose}>
      <h3>Edit category</h3>
      {/* Icon and colour changes were invisible until after saving — this shows
          what you're about to commit, and whether anything is pending. */}
      <div className="cat-preview">
        <span className="icon" aria-hidden="true" style={{ background: `${color}33`, color }}>
          {icon}
        </span>
        <span className="cat-preview-name">{name || "Unnamed"}</span>
        {dirty && <span className="row-badge">Unsaved</span>}
      </div>
      <label>Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </label>
        <label>Icon
          <button type="button" className="icon-btn wide" onClick={() => setEmojiOpen(true)}>
            {icon || "📦"}
          </button>
        </label>
        <label>Color
          <ColorDots value={color} onChange={setColor} />
        </label>
        {emojiOpen && (
          <EmojiSheet
            current={icon}
            onSelect={(e) => {
              setIcon(e);
              setEmojiOpen(false);
            }}
            onClose={() => setEmojiOpen(false)}
          />
        )}
        <ErrorNote error={err} />
        <div className="sheet-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (!name.trim()) return setErr("Name is required");
              saveMutation.mutate();
            }}
            disabled={saveMutation.isPending || !dirty}
          >
            {saveMutation.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
          <button type="button" className="quiet" onClick={onClose}>Cancel</button>
          <button type="button" className="sheet-archive" onClick={onToggleArchive}>
            {category.archived ? "Restore category" : "Archive category"}
          </button>
          {category.archived && (
            <button type="button" className="danger" onClick={onRequestDelete}>
              Delete category
            </button>
          )}
        </div>
    </Sheet>
  );
}
