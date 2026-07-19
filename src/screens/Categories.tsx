import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCategories, createCategory, updateCategory, deleteCategory } from "../api";
import type { Category } from "../../shared/schemas";
import ConfirmSheet from "../components/ConfirmSheet";

const PALETTE = [
  "#f59e0b", "#f97316", "#ef4444", "#ec4899", "#d946ef", "#8b5cf6",
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#eab308", "#8a8f98",
];

const EMOJIS = [
  "🍔", "🍕", "🍜", "🍣", "☕", "🍺", "🛒", "🥦", "🍎", "🎂",
  "🚗", "⛽", "🅿️", "🚌", "🚕", "✈️", "🏝️", "🏠", "🏡", "💡",
  "🌐", "📱", "💻", "🎮", "🎬", "🎵", "🎨", "📚", "🏋️", "⚽",
  "🧘", "💆", "💇", "💊", "🩺", "🐶", "🐱", "👕", "👟", "💍",
  "🎁", "❤️", "🎉", "👶", "🧾", "💼", "🎓", "✏️", "🔧", "🧰",
  "🧴", "🧻", "🪑", "🛏️", "📦", "💸", "🏦", "💳", "🎰", "🚬",
];

function EmojiSheet({
  current,
  onSelect,
  onClose,
}: {
  current: string;
  onSelect: (e: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal picker-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Icon</h3>
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`emoji-cell ${current === e ? "on" : ""}`}
              onClick={() => onSelect(e)}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="color-dots">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`color ${c}`}
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
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  const cats = categoriesQuery.data ?? [];
  const active = cats.filter((c) => !c.archived);
  const archived = cats.filter((c) => c.archived);

  return (
    <div className="cats-screen">
      <CreateForm onDone={invalidate} />
      {err && <p className="error">{err}</p>}

      <ul className="cat-list">
        {active.map((c) => (
          <li key={c.id}>
            <span className="icon" style={{ background: `${c.color}33` }}>{c.icon}</span>
            <span className="mid">{c.name}</span>
            <button type="button" onClick={() => setEditing(c)}>Edit</button>
            <button
              type="button"
              onClick={() => archiveMutation.mutate({ id: c.id, archived: true })}
            >
              Archive
            </button>
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <>
          <h3 className="muted">Archived</h3>
          <ul className="cat-list archived">
            {archived.map((c) => (
              <li key={c.id}>
                <span className="icon">{c.icon}</span>
                <span className="mid">{c.name}</span>
                <button
                  type="button"
                  onClick={() => archiveMutation.mutate({ id: c.id, archived: false })}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => setConfirmCat(c)}
                >
                  Delete
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
          onConfirm={() => deleteMutation.mutate(confirmCat.id)}
          onClose={() => setConfirmCat(null)}
        />
      )}

      {editing && (
        <EditCategoryModal
          category={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState("#8a8f98");
  const [err, setErr] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => createCategory({ name: name.trim(), icon, color, parentId: null, sortOrder: 999 }),
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
      {err && <p className="error">{err}</p>}
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
}: {
  category: Category;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon);
  const [color, setColor] = useState(category.color);
  const [err, setErr] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => updateCategory(category.id, { name: name.trim(), icon, color }),
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit category</h3>
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
        {err && <p className="error">{err}</p>}
        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (!name.trim()) return setErr("Name is required");
              saveMutation.mutate();
            }}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
