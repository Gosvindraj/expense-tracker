import { useRef, useState } from "react";
import type { Category, Expense } from "../../shared/schemas";
import { fmtAmount } from "../lib/format";
import Icon from "./Icon";

const SWIPE_TRIGGER = 96; // px before a swipe commits to delete
const LONG_PRESS_MS = 450;
const MOVE_SLOP = 8; // px of travel before we call it a drag, not a tap

/**
 * One expense row, carrying three gestures without them fighting:
 *   tap         → edit (or toggle, in selection mode)
 *   long-press  → enter selection mode
 *   swipe left  → delete
 *
 * Vertical movement always yields to the scroller: a drag is only claimed as
 * horizontal once it's clearly more sideways than up-down.
 */
export default function ExpenseRow({
  expense,
  category,
  selecting,
  selected,
  onOpen,
  onToggleSelect,
  onStartSelecting,
  onDelete,
}: {
  expense: Expense;
  category: Category | undefined;
  selecting: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onStartSelecting: () => void;
  onDelete: () => void;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"none" | "x" | "y">("none");
  const longPress = useRef<number | undefined>(undefined);
  const moved = useRef(false);

  const clearLongPress = () => {
    if (longPress.current !== undefined) {
      clearTimeout(longPress.current);
      longPress.current = undefined;
    }
  };

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = "none";
    moved.current = false;
    if (!selecting) {
      longPress.current = window.setTimeout(() => {
        onStartSelecting();
        onToggleSelect();
        longPress.current = undefined;
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;
    if (Math.abs(ddx) > MOVE_SLOP || Math.abs(ddy) > MOVE_SLOP) {
      moved.current = true;
      clearLongPress();
    }
    if (axis.current === "none" && (Math.abs(ddx) > MOVE_SLOP || Math.abs(ddy) > MOVE_SLOP)) {
      // let the page scroll unless this is decisively horizontal
      axis.current = Math.abs(ddx) > Math.abs(ddy) * 1.4 ? "x" : "y";
    }
    if (axis.current === "x" && !selecting) {
      e.preventDefault();
      setDx(Math.min(0, ddx)); // left only
    }
  }

  function onPointerUp() {
    clearLongPress();
    const swiped = dx <= -SWIPE_TRIGGER;
    const wasTap = !moved.current && axis.current === "none";
    setDx(0);
    start.current = null;
    if (swiped) return onDelete();
    if (!wasTap) return;
    if (selecting) onToggleSelect();
    else onOpen();
  }

  function onPointerCancel() {
    clearLongPress();
    setDx(0);
    start.current = null;
  }

  const armed = dx <= -SWIPE_TRIGGER;

  return (
    <li className={`swipe-row ${selected ? "selected" : ""}`}>
      <span className={`swipe-behind ${armed ? "armed" : ""}`} aria-hidden="true">
        <Icon name="close" />
        {armed ? "Release to delete" : "Delete"}
      </span>
      <button
        type="button"
        className="row-btn"
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={selecting ? selected : undefined}
      >
        {selecting && (
          <span className={`row-check ${selected ? "on" : ""}`} aria-hidden="true">
            {selected && <Icon name="check" />}
          </span>
        )}
        <span
          className="icon"
          aria-hidden="true"
          style={{ background: `${category?.color ?? "#8a8f98"}33` }}
        >
          {category?.icon ?? "📦"}
        </span>
        <span className="mid">
          <span className="cat-name">
            {category?.name ?? "Unknown"}
            {/* No "Imported" badge: virtually every row came from the Wallet
                migration, so it would mark almost the whole list and tell you
                nothing. Recurring is rare enough to be worth flagging. */}
            {expense.recurringRuleId !== null && (
              <span className="row-badge" title="Logged by a recurring rule">
                Recurring
              </span>
            )}
          </span>
          {expense.note && <span className="note">{expense.note}</span>}
        </span>
        <span className="amount">−{fmtAmount(expense.amountMinor)}</span>
      </button>
    </li>
  );
}
