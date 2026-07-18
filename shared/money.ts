/** Amounts are stored as integer minor units (cents) everywhere. */

export function formatMinor(minor: number, locale?: string): string {
  return (minor / 100).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Parse user input like "12.34" / "12,34" / "12" into minor units. */
export function parseToMinor(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}
