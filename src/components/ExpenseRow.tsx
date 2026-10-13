import { useRef, useState } from "react";
import type { Category, Expense } from "../../shared/schemas";
import { fmtAmount } from "../lib/format";
import Icon from "./Icon";

const SWIPE_TRIGGER = 88; // px of travel before a release commits to delete
const SWIPE_MAX = 132; // beyond this the row resists, so it can't be flung away
const LONG_PRESS_MS = 400;
const MOVE_SLOP = 8; // px before a press counts as a drag
const AXIS_BIAS = 1.2; // how much more horizontal than vertical a swipe must be

/**
 * One expense row, with two gestures:
 *   long-press → edit
 *   swipe left → delete
 *
 * A plain tap does nothing, deliberately: the list is mostly scrolled and read,
 * and tap-to-edit on a scrolling list fires by accident often enough to be
 * worse than the half-second a deliberate press costs.
 *
 * The drag writes `transform` straight to the node rather than going through
 * React state. Two reasons: a re-render per pointermove is jank on a long list,
 * and the CSS transition that smooths the snap-back must be *off* while the
 * finger is down or the row lags behind it — which is what made releasing feel
 * unpredictable. Only the threshold crossing is state, because that's the one
 * thing that has to re-render.
 */
export default function ExpenseRow({
  expense,
  category,
  onOpen,
  onDelete,
}: {
  expense: Expense;
  category: Category | undefined;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [pressing, setPressing] = useState(false);

  const row = useRef<HTMLLIElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const settle = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"none" | "x" | "y">("none");
  const dx = useRef(0);
  const longPress = useRef<number | undefined>(undefined);
  const opened = useRef(false); // long-press fired; the release must not delete

  const setX = (x: number, animate: boolean) => {
    const el = btn.current;
    if (!el) return;
    el.style.transition = animate ? "transform 0.18s ease-out" : "none";
    el.style.transform = x ? `translateX(${x}px)` : "";
  };

  // The red panel only exists while a swipe is in progress. Left painted behind
  // every row, iOS momentum scrolling flashes it whenever a row's layer
  // composites a frame late.
  const setSwiping = (on: boolean, delay = 0) => {
    clearTimeout(settle.current);
    settle.current = undefined;
    const apply = () => row.current?.classList.toggle("swiping", on);
    if (delay) settle.current = window.setTimeout(apply, delay);
    else apply();
  };

  const cancelLongPress = () => {
    if (longPress.current !== undefined) {
      clearTimeout(longPress.current);
      longPress.current = undefined;
    }
    setPressing(false);
  };

  function reset(animate = true) {
    dx.current = 0;
    axis.current = "none";
    start.current = null;
    setArmed(false);
    setX(0, animate);
    // hold the panel until the snap-back has finished covering it
    setSwiping(false, animate ? 180 : 0);
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // capture, or a fast drag leaves the element and we stop hearing about it —
    // the row would freeze mid-swipe and never get its pointerup
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    axis.current = "none";
    dx.current = 0;
    opened.current = false;
    setPressing(true);
    longPress.current = window.setTimeout(() => {
      longPress.current = undefined;
      opened.current = true;
      setPressing(false);
      navigator.vibrate?.(12); // Android only
      onOpen();
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current || opened.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;

    if (axis.current === "none") {
      if (Math.abs(mx) < MOVE_SLOP && Math.abs(my) < MOVE_SLOP) return;
      cancelLongPress();
      // vertical wins ties: scrolling the list must never be hijacked
      axis.current = Math.abs(mx) > Math.abs(my) * AXIS_BIAS ? "x" : "y";
      if (axis.current === "x") setSwiping(true);
    }
    if (axis.current !== "x") return;

    // resist past the maximum instead of stopping dead, so the limit is felt
    const raw = Math.min(0, mx);
    const over = Math.max(0, -raw - SWIPE_MAX);
    dx.current = -(Math.min(-raw, SWIPE_MAX) + over * 0.25);
    setX(dx.current, false);

    const nowArmed = dx.current <= -SWIPE_TRIGGER;
    if (nowArmed !== armed) {
      setArmed(nowArmed);
      if (nowArmed) navigator.vibrate?.(10); // the moment it will delete
    }
  }

  function onPointerUp() {
    cancelLongPress();
    if (opened.current) return reset(false);
    const commit = dx.current <= -SWIPE_TRIGGER;
    if (!commit) return reset();
    // slide clear before removing, so the row doesn't snap back and vanish
    setX(-window.innerWidth, true);
    setArmed(false);
    window.setTimeout(onDelete, 140);
  }

  return (
    <li ref={row} className="swipe-row">
      <span className={`swipe-behind ${armed ? "armed" : ""}`} aria-hidden="true">
        <Icon name="close" />
        {armed ? "Release to delete" : "Delete"}
      </span>
      <button
        ref={btn}
        type="button"
        className={`row-btn ${pressing ? "pressing" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          cancelLongPress();
          reset();
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-label={`Edit ${category?.name ?? "expense"}, ${fmtAmount(expense.amountMinor)}`}
      >
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
