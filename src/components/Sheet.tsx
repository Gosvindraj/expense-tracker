import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";

/**
 * One overlay primitive for every sheet and modal in the app.
 *
 * Owns the behaviour that used to be missing everywhere: dialog semantics,
 * Escape to close, a focus trap, focus return to whatever opened it, scroll
 * lock on the screen underneath, and Android-back closing the topmost sheet
 * instead of leaving the app.
 */

type Entry = {
  id: number;
  close: () => void;
  /** history snapshot taken when this sheet opened, restored if Back is pressed */
  state: unknown;
  url: string;
};

let seq = 0;
const stack: Entry[] = [];
const listeners = new Set<() => void>();

/** True while any sheet is open — App uses this to ignore the absorbed popstate. */
export const anySheetOpen = () => stack.length > 0;

function sync() {
  document.documentElement.classList.toggle("sheet-open", stack.length > 0);
  for (const l of listeners) l();
}

function open(entry: Entry) {
  stack.push(entry);
  sync();
}

function close(id: number) {
  const i = stack.findIndex((s) => s.id === id);
  if (i !== -1) stack.splice(i, 1);
  sync();
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || stack.length === 0) return;
    e.preventDefault();
    stack[stack.length - 1].close();
  });

  // Back closes the topmost sheet. We deliberately push no entry when a sheet
  // opens (that races with StrictMode's double-mount); instead we absorb the
  // pop and restore the entry the sheet was opened from, so tab history is
  // left exactly as it was.
  window.addEventListener("popstate", () => {
    if (stack.length === 0) return;
    const top = stack[stack.length - 1];
    top.close();
    history.pushState(top.state, "", top.url);
  });
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Sheet({
  title,
  className = "",
  variant = "sheet",
  onClose,
  children,
}: {
  /** Rendered as the dialog's heading and its accessible name. */
  title: string;
  className?: string;
  /** "sheet" = dimmed backdrop + bottom sheet. "full" = full-screen surface. */
  variant?: "sheet" | "full";
  onClose: () => void;
  children: ReactNode;
}) {
  const [id] = useState(() => ++seq);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // re-render this sheet when the stack changes, so only the topmost one dims
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const opener = document.activeElement as HTMLElement | null;

    open({
      id,
      close: () => onCloseRef.current(),
      state: history.state,
      url: location.href,
    });

    // Focus the sheet itself, never its first field: focusing a text input
    // throws up the on-screen keyboard the moment a sheet opens, which on a
    // phone covers the very thing the user came to look at. Tab still enters
    // the sheet from here, and the trap below still holds.
    surface.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [...surface.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === surface)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    surface.addEventListener("keydown", trap);

    return () => {
      surface.removeEventListener("keydown", trap);
      close(id);
      // return focus to the control that opened us, if it's still around
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [id]);

  const isTop = stack[stack.length - 1]?.id === id;

  const surface = (
    <div
      ref={surfaceRef}
      className={variant === "full" ? `composer-overlay ${className}` : `modal ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );

  if (variant === "full") return surface;

  return (
    <div className={`modal-backdrop ${isTop ? "" : "nested"}`} onClick={onClose}>
      {surface}
    </div>
  );
}
