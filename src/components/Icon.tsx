/**
 * The app's icon set — one vocabulary, matching the tab bar's stroked style.
 *
 * Replaces the text glyphs that were standing in for icons (`⌗ ✕ ✎ ⏸ ▶ ‹ › ▲ ▼ ✓`),
 * which rendered differently on every platform and couldn't inherit stroke
 * weight or colour.
 *
 * Deliberately NOT included: `×`, `÷`, `−`. Those are the calculator keypad's
 * operators and the minus sign prefixing amounts — real typography, not icons.
 */
const PATHS = {
  grid: <path d="M4 9h16M4 15h16M9 4v16M15 4v16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  edit: <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="M7 4.5v15l12-7.5-12-7.5z" />,
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12.5 5 5L19 7" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  minus: <path d="M6 12h12" />,
  plus: <path d="M12 6v12M6 12h12" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`icon-svg ${className}`} aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
