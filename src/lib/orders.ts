export const ORDER_STATUS_ORDER = [
  "NEED_TO_ORDER",
  "ORDERED",
  "PARTIALLY_DELIVERED",
  "ARRIVED",
  "PROBLEM",
  "MISSING_ITEMS",
  "CANCELLED",
] as const;

const ORDER_STATUS_RANK = new Map<string, number>(
  ORDER_STATUS_ORDER.map((status, index) => [status, index])
);

type OrderLineForValue = {
  orderedQty?: number | null;
  suggestedQty?: number | null;
  purchasePrice?: number | null;
  purchasePriceSnapshot?: number | null;
  item?: { purchasePrice?: number | null } | null;
};

export function orderStatusRank(status: string): number {
  return ORDER_STATUS_RANK.get(status) ?? ORDER_STATUS_ORDER.length;
}

export function compareOrdersByStatusThenDate(a: { status: string; createdAt: string | Date }, b: { status: string; createdAt: string | Date }) {
  const statusDiff = orderStatusRank(a.status) - orderStatusRank(b.status);
  if (statusDiff !== 0) return statusDiff;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export function orderLinePurchasePrice(line: OrderLineForValue): number {
  const snapshot = Number(line.purchasePriceSnapshot ?? 0) || 0;
  return snapshot > 0 ? snapshot : Number(line.item?.purchasePrice ?? line.purchasePrice ?? 0) || 0;
}

export function orderLineQty(line: OrderLineForValue): number {
  return Number(line.orderedQty ?? line.suggestedQty ?? 0) || 0;
}

export function calculateOrderValue(lines: OrderLineForValue[]): number {
  return lines.reduce((sum, line) => sum + orderLineQty(line) * orderLinePurchasePrice(line), 0);
}

export function fmtMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
