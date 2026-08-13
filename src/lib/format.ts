import { formatMinor } from "../../shared/money";

export const CURRENCY = "RM";

export const fmtAmount = (minor: number) => `${CURRENCY} ${formatMinor(minor)}`;

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → 'YYYY-MM-DD HH:MM:SS' in local time (the DB format). */
export function toSpentAt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Date → value for <input type="datetime-local">. */
export function toDatetimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'YYYY-MM-DD HH:MM:SS' → 'YYYY-MM-DDTHH:MM' for datetime-local inputs. */
export const spentAtToInput = (s: string) => s.slice(0, 16).replace(" ", "T");

/** 'YYYY-MM-DDTHH:MM' from a datetime-local input → DB format. */
export const inputToSpentAt = (s: string) => `${s.replace("T", " ")}:00`;

/** 'YYYY-MM-DD HH:MM:SS' → 'Wed, 16 Jul 2026 12:00'. */
export function fmtSpentAt(s: string): string {
  const d = new Date(s.replace(" ", "T"));
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 'YYYY-MM-DD HH:MM:SS' → 'Wed, 16 Jul 2026' (for day group headers). */
export function fmtDay(s: string): string {
  const d = new Date(s.replace(" ", "T"));
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ---------- the app's date vocabulary ----------
 *
 * Four competing formats had grown up in four screens: "16 Jul 26" in filter
 * chips, "16 Jul 2026" in Plan, "Wed, 16 Jul 2026" in list headers, and a raw
 * "2026-07-18 06:17:57" in Import. These are the sanctioned three, all taking a
 * 'YYYY-MM-DD' (or longer) string.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** '2026-07-16' → '16 Jul 26'. Compact: chips, dense rows. */
export const fmtDateShort = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;

/** '2026-07-16' → '16 Jul 2026'. Default: form fields, detail lines. */
export const fmtDate = (iso: string) =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** '2026-07' → 'Jul 2026'. Month granularity. */
export const fmtMonth = (ym: string) =>
  `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** '2026-07-18 06:17:57' → '18 Jul 2026, 06:17'. Timestamps. */
export const fmtDateTime = (s: string) =>
  `${fmtDate(s.slice(0, 10))}, ${s.slice(11, 16)}`;

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Day-group heading: 'Today' / 'Yesterday' for the recent two, otherwise the
 * full weekday form. Scanning a list, the two most common days deserve names
 * rather than dates you have to decode.
 */
export function fmtDayHeading(spentAt: string): string {
  const day = spentAt.slice(0, 10);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day === isoOf(now)) return "Today";
  if (day === isoOf(yesterday)) return "Yesterday";
  return fmtDay(spentAt);
}
