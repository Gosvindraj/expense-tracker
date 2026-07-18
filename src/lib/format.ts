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
