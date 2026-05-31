// Shared, dependency-free helpers for daily-count quantity parsing.
// Extracted so the parsing rules can be unit-tested without a DB.

export type RawCountValues = Record<string, string>;
export type CleanEntry = { itemId: string; countedQty: number };

/**
 * Parse a user-entered quantity string into a finite number.
 *
 * Handles the real-world bug that crashed submission: Hebrew/locale decimal
 * commas ("3,5"), stray whitespace, and trailing unit text ("3 kg"). Returns
 * null for anything that isn't a non-negative finite number, so callers can
 * skip it instead of sending NaN (which JSON.stringify silently turns into
 * `null`, which Prisma then rejects on a required Float column).
 */
export function parseQty(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (s === "") return null;
  // normalise decimal comma -> dot, strip everything except digits, dot, minus
  s = s.replace(",", ".").replace(/[^\d.\-]/g, "");
  if (s === "" || s === "-" || s === "." ) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  // clamp to 3 decimals to match the stock ledger precision
  return Math.round(n * 1000) / 1000;
}

/**
 * Turn the count screen's { itemId: "rawString" } map into clean entries,
 * dropping blanks and invalid numbers.
 */
export function sanitizeCountEntries(values: RawCountValues): CleanEntry[] {
  const out: CleanEntry[] = [];
  for (const [itemId, raw] of Object.entries(values)) {
    const qty = parseQty(raw);
    if (qty === null) continue;
    out.push({ itemId, countedQty: qty });
  }
  return out;
}
