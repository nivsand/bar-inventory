// Shared, dependency-free helpers for weekly sales import: tabular parsing,
// POS-name normalization, and fuzzy product-name matching.

export type SalesRow = { posProductName: string; quantitySold: number; revenue: number | null };

// Header aliases for the flexible-column parser (Hebrew/English POS exports).
const NAME_ALIASES = ["product", "item", "name", "מוצר", "פריט", "שם מוצר", "שם"];
const QTY_ALIASES = ["qty", "quantity", "sold", "units", "כמות", "נמכר", "כמות שנמכרה"];
const REVENUE_ALIASES = ["revenue", "total", "amount", "sales", "הכנסה", "סכום", "מחיר", "תקבול"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => aliases.includes(normalizeHeader(h)));
}

/**
 * Parse CSV or tab-separated tabular text (the format Excel produces when
 * copy-pasted) into sales rows. The first row must be a header row; column
 * order doesn't matter as long as a product-name and quantity column can be
 * matched via the alias lists above.
 */
export function parseTabularSales(text: string): SalesRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const split = (line: string) => line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));

  const headers = split(lines[0]);
  const nameCol = findColumn(headers, NAME_ALIASES);
  const qtyCol = findColumn(headers, QTY_ALIASES);
  const revenueCol = findColumn(headers, REVENUE_ALIASES);
  if (nameCol === -1 || qtyCol === -1) return [];

  const out: SalesRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = split(lines[i]);
    const posProductName = cells[nameCol]?.trim();
    if (!posProductName) continue;
    const qty = Number(String(cells[qtyCol] ?? "").replace(/[^\d.\-]/g, ""));
    if (!Number.isFinite(qty)) continue;
    const revenueRaw = revenueCol >= 0 ? cells[revenueCol] : undefined;
    const revenue = revenueRaw ? Number(String(revenueRaw).replace(/[^\d.\-]/g, "")) : null;
    out.push({ posProductName, quantitySold: qty, revenue: revenue !== null && Number.isFinite(revenue) ? revenue : null });
  }
  return out;
}

/** Normalize a POS product name for mapping lookups: lowercase, trim, collapse whitespace. */
export function normalizeProductName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// Levenshtein distance, used to rank fuzzy match suggestions.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Score how well a POS product name matches an inventory item name (0..1,
 * higher = better). Combines substring containment with edit-distance
 * similarity so "Guac" matches "Guacamole" and "Coke Bottle" matches
 * "Coca Cola 330ml".
 */
export function matchScore(posName: string, itemName: string): number {
  const a = normalizeProductName(posName);
  const b = normalizeProductName(itemName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;
  const dist = levenshtein(a, b);
  return Math.max(0, 1 - dist / Math.max(a.length, b.length));
}

/** Return the top N inventory items most likely to match a POS product name. */
export function suggestMatches(
  posName: string,
  items: { id: string; nameHe: string; nameEn: string }[],
  limit = 3
): { id: string; score: number }[] {
  return items
    .map((item) => ({ id: item.id, score: Math.max(matchScore(posName, item.nameHe), matchScore(posName, item.nameEn)) }))
    .filter((s) => s.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
