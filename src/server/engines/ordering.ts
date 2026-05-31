/**
 * Smart Ordering Engine (rule-based, no external AI).
 *
 * For each raw item it decides WHAT to order, HOW MUCH, and WHY, based on:
 *   current stock, min stock, par (target), average daily usage,
 *   next delivery date, and the next ordering deadline.
 *
 * Coverage logic:
 *   We must hold enough stock to cover demand until the NEXT delivery that can
 *   arrive after the upcoming order. If projected stock at that point falls below
 *   the safety minimum, we order up to par (rounded to pack/order multiples).
 */
import { addDays, differenceInCalendarDays } from "date-fns";

export type OrderingItemInput = {
  id: string;
  nameHe: string; nameEn: string;
  unit: string;
  currentQty: number;
  minQty: number;
  parQty: number;
  avgDailyUsage: number;
  packSize?: number | null;
  orderMultiple?: number | null;
  // Ordering unit (e.g. a "box" containing 10 cakes)
  unitsPerOrderUnit?: number | null;
  orderUnitNameHe?: string | null;
  orderUnitNameEn?: string | null;
  supplierId?: string | null;
};

export type SupplierSchedule = {
  id: string;
  orderDeadlineDays: number[]; // weekdays 0..6
  deliveryDays: number[];      // weekdays 0..6
  leadTimeDays: number;
};

export type OrderSuggestion = {
  itemId: string;
  nameHe: string; nameEn: string;
  unit: string;
  currentQty: number;
  minQty: number;
  parQty: number;
  suggestedQty: number;            // in base units (after rounding to order unit)
  // Order-unit breakdown (e.g. 1 box of 10)
  orderUnitQty: number | null;     // how many order units to buy
  unitsPerOrderUnit: number | null;
  orderUnitNameHe: string | null;
  orderUnitNameEn: string | null;
  daysUntilDelivery: number;
  projectedAtDelivery: number;
  reasonKey: ReasonKey;
  reason: string; // human readable (English; UI can localize via reasonKey)
};

export type ReasonKey =
  | "SHORTAGE_BEFORE_DELIVERY"
  | "BELOW_MIN"
  | "BELOW_PAR"
  | "OK";

function nextWeekdayDate(from: Date, weekdays: number[], minOffset = 0): Date | null {
  if (!weekdays || weekdays.length === 0) return null;
  for (let i = minOffset; i <= minOffset + 14; i++) {
    const d = addDays(from, i);
    if (weekdays.includes(d.getDay())) return d;
  }
  return null;
}

/**
 * Round an order quantity (in base units) up to a valid quantity. We round to
 * the strongest constraint available: the order unit (units per box), else the
 * order multiple, else the pack size; otherwise to 1 decimal.
 */
export function roundToPack(qty: number, item: OrderingItemInput): number {
  const step = item.unitsPerOrderUnit || item.orderMultiple || item.packSize || 0;
  if (step && step > 0) return Math.ceil(qty / step) * step;
  // default: round up to 1 decimal
  return Math.ceil(qty * 10) / 10;
}

/**
 * The next delivery we can rely on is the first delivery day that occurs at or
 * after (today + supplier lead time). Demand must be covered until THEN.
 */
export function computeDaysUntilDelivery(today: Date, sched?: SupplierSchedule): number {
  if (!sched) return 3; // sensible default horizon when no schedule known
  const earliest = sched.leadTimeDays ?? 1;
  const deliveryDate = nextWeekdayDate(today, sched.deliveryDays, earliest);
  if (!deliveryDate) return Math.max(earliest, 3);
  return Math.max(1, differenceInCalendarDays(deliveryDate, today));
}

export function suggestForItem(
  item: OrderingItemInput,
  today: Date,
  sched?: SupplierSchedule
): OrderSuggestion {
  const daysUntilDelivery = computeDaysUntilDelivery(today, sched);
  const projectedAtDelivery = item.currentQty - item.avgDailyUsage * daysUntilDelivery;

  let suggestedQty = 0;
  let reasonKey: ReasonKey = "OK";

  // Decide if we need to order, and how much (bring up to par after covering demand).
  const willRunShort = projectedAtDelivery < item.minQty;
  if (willRunShort) {
    // Order enough to reach par AFTER covering consumption until delivery.
    const need = item.parQty - projectedAtDelivery;
    suggestedQty = roundToPack(Math.max(need, item.minQty - item.currentQty), item);
    reasonKey = "SHORTAGE_BEFORE_DELIVERY";
  } else if (item.currentQty < item.minQty) {
    suggestedQty = roundToPack(item.parQty - item.currentQty, item);
    reasonKey = "BELOW_MIN";
  } else if (item.currentQty < item.parQty * 0.5) {
    suggestedQty = roundToPack(item.parQty - item.currentQty, item);
    reasonKey = "BELOW_PAR";
  }

  const finalQty = Math.max(0, suggestedQty);
  const upo = item.unitsPerOrderUnit && item.unitsPerOrderUnit > 0 ? item.unitsPerOrderUnit : null;
  const orderUnitQty = upo ? Math.ceil(finalQty / upo) : null;

  return {
    itemId: item.id,
    nameHe: item.nameHe, nameEn: item.nameEn, unit: item.unit,
    currentQty: item.currentQty, minQty: item.minQty, parQty: item.parQty,
    suggestedQty: finalQty,
    orderUnitQty,
    unitsPerOrderUnit: upo,
    orderUnitNameHe: item.orderUnitNameHe ?? null,
    orderUnitNameEn: item.orderUnitNameEn ?? null,
    daysUntilDelivery,
    projectedAtDelivery: Math.round(projectedAtDelivery * 100) / 100,
    reasonKey,
    reason: explain(reasonKey, item, daysUntilDelivery, projectedAtDelivery),
  };
}

/** Format an order-unit summary, e.g. "1 box (10 kg)". Returns null if no order unit. */
export function formatOrderUnit(s: OrderSuggestion, lang: "he" | "en"): string | null {
  if (!s.orderUnitQty || !s.unitsPerOrderUnit) return null;
  const unitName = (lang === "en" ? s.orderUnitNameEn : s.orderUnitNameHe) || (lang === "en" ? "unit" : "יחידה");
  return `${s.orderUnitQty} ${unitName} (${s.suggestedQty} ${s.unit})`;
}

function explain(key: ReasonKey, item: OrderingItemInput, days: number, projected: number): string {
  switch (key) {
    case "SHORTAGE_BEFORE_DELIVERY":
      return `Projected stock ${projected.toFixed(1)} ${item.unit} falls below minimum ${item.minQty} ${item.unit} before next delivery in ${days} day(s) (usage ${item.avgDailyUsage}/day).`;
    case "BELOW_MIN":
      return `Current stock ${item.currentQty} ${item.unit} is below minimum ${item.minQty} ${item.unit}.`;
    case "BELOW_PAR":
      return `Current stock ${item.currentQty} ${item.unit} is well below par ${item.parQty} ${item.unit}.`;
    default:
      return "Stock is sufficient.";
  }
}

/** Run the engine over many items. Optionally add extra demand (e.g. from prep needs). */
export function buildSuggestions(
  items: OrderingItemInput[],
  scheduleBySupplier: Map<string, SupplierSchedule>,
  today: Date,
  extraDemand: Map<string, number> = new Map()
): OrderSuggestion[] {
  return items
    .map((it) => {
      // Fold prep-driven demand into current shortfall by reducing effective stock.
      const extra = extraDemand.get(it.id) ?? 0;
      const adjusted = { ...it, currentQty: it.currentQty - extra };
      const sched = it.supplierId ? scheduleBySupplier.get(it.supplierId) : undefined;
      const s = suggestForItem(adjusted, today, sched);
      // report the real current qty back to the user
      s.currentQty = it.currentQty;
      return s;
    })
    .filter((s) => s.suggestedQty > 0);
}
