import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Bottom-anchored toast stack, above the tab bar.
 *
 * Exists so feedback isn't tied to the button that caused it — the old
 * "Saved ✓" flash was invisible the moment you scrolled — and so destructive
 * actions can offer Undo instead of only a confirm dialog.
 */

export type ToastSpec = {
  message: string;
  /** Optional action, e.g. Undo. Tapping it dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** ms before auto-dismiss. Defaults to 5000, or 3000 with no action. */
  duration?: number;
  tone?: "default" | "error";
};

type ToastItem = ToastSpec & { id: number };

let seq = 0;

const ToastCtx = createContext<(t: ToastSpec) => void>(() => {});

/** `const toast = useToast(); toast({ message: "Saved" })` */
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setItems((s) => s.filter((i) => i.id !== id));
  }, []);

  const push = useCallback(
    (spec: ToastSpec) => {
      const id = ++seq;
      const duration = spec.duration ?? (spec.action ? 5000 : 3000);
      setItems((s) => [...s, { ...spec, id }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "error" ? "error" : ""}`}>
            <span className="toast-msg">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
