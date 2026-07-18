import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCategories, createCategory, updateCategory, deleteCategory } from "../api";
import type { Category } from "../../shared/schemas";

export default function Categories() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const [editing, setEditing] = useState<Category | null>(null);
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
      <h2>Categories</h2>
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
                  onClick={() => {
                    if (confirm(`Delete "${c.name}"? Only possible if it has no expenses.`))
                      deleteMutation.mutate(c.id);
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
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
      <input value={icon} onChange={(e) => setIcon(e.target.value)} className="icon-input" maxLength={4} />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" maxLength={60} />
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      <button type="submit" className="primary" disabled={createMutation.isPending}>Add</button>
      {err && <p className="error">{err}</p>}
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
        <label>Icon (emoji)
          <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
        </label>
        <label>Color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
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
