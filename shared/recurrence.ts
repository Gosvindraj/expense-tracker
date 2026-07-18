/** Due-date advancement for recurring rules. Dates are 'YYYY-MM-DD' strings. */

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOf = (y: number, m1: number) => new Date(y, m1, 0).getDate(); // m1 is 1-based

export function advanceDue(
  due: string,
  frequency: "weekly" | "monthly" | "yearly",
  interval: number,
  anchorDay: number | null,
): string {
  const [y, m, d] = due.split("-").map(Number);
  if (frequency === "weekly") {
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 7 * interval);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  if (frequency === "monthly") {
    // anchor keeps "the 31st" meaning month-end forever instead of drifting to the 28th
    const anchor = anchorDay ?? d;
    const total = (m - 1) + interval;
    const ny = y + Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${ny}-${pad(nm)}-${pad(Math.min(anchor, lastDayOf(ny, nm)))}`;
  }
  // yearly: same month/day, clamped (Feb 29 -> Feb 28 on non-leap years)
  const ny = y + interval;
  return `${ny}-${pad(m)}-${pad(Math.min(d, lastDayOf(ny, m)))}`;
}

/** Project upcoming occurrences of a rule within [from, to], inclusive. */
export function projectOccurrences(
  rule: {
    nextDueOn: string;
    frequency: "weekly" | "monthly" | "yearly";
    interval: number;
    anchorDay: number | null;
    endOn: string | null;
    active: boolean;
  },
  from: string,
  to: string,
  cap = 40,
): string[] {
  if (!rule.active) return [];
  const out: string[] = [];
  let due = rule.nextDueOn;
  while (due <= to && out.length < cap) {
    if (rule.endOn && due > rule.endOn) break;
    if (due >= from) out.push(due);
    due = advanceDue(due, rule.frequency, rule.interval, rule.anchorDay);
  }
  return out;
}
