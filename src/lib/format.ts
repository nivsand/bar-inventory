export const WEEKDAYS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
export const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function fmtDays(days: number[], locale: string) {
  const w = locale === "he" ? WEEKDAYS_HE : WEEKDAYS_EN;
  return (days || []).map((d) => w[d]).join(", ");
}
export function qty(n: number) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
