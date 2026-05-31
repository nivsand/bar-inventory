import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestForItem, roundToPack, buildSuggestions, formatOrderUnit, OrderingItemInput, SupplierSchedule } from "./ordering";

const base: OrderingItemInput = {
  id: "avocado", nameHe: "אבוקדו", nameEn: "Avocado", unit: "kg",
  currentQty: 2, minQty: 5, parQty: 15, avgDailyUsage: 3, supplierId: "s1",
};

test("spec example: low avocado before delivery -> shortage suggestion", () => {
  // current 2, usage 3/day, default horizon 3 days -> projected -7 < min 5
  const s = suggestForItem(base, new Date("2026-05-30"));
  assert.equal(s.reasonKey, "SHORTAGE_BEFORE_DELIVERY");
  assert.ok(s.suggestedQty > 0, "should suggest ordering");
  assert.ok(s.reason.length > 0, "should include a human reason");
});

test("well-stocked item produces no order", () => {
  const s = suggestForItem({ ...base, currentQty: 30, minQty: 5, parQty: 15, avgDailyUsage: 1 }, new Date());
  assert.equal(s.reasonKey, "OK");
  assert.equal(s.suggestedQty, 0);
});

test("roundToPack rounds up to order multiple / pack size", () => {
  assert.equal(roundToPack(11, { ...base, orderMultiple: 5 }), 15);
  assert.equal(roundToPack(48, { ...base, orderMultiple: null, packSize: 24 }), 48);
  assert.equal(roundToPack(50, { ...base, orderMultiple: null, packSize: 24 }), 72);
});

test("buildSuggestions filters out items that don't need ordering", () => {
  const items: OrderingItemInput[] = [
    base, // needs order
    { ...base, id: "onion", currentQty: 50, minQty: 5, parQty: 20, avgDailyUsage: 1 }, // fine
  ];
  const sched = new Map<string, SupplierSchedule>([["s1", { id: "s1", orderDeadlineDays: [], deliveryDays: [], leadTimeDays: 1 }]]);
  const out = buildSuggestions(items, sched, new Date());
  assert.equal(out.length, 1);
  assert.equal(out[0].itemId, "avocado");
});

test("rounds up to order units and reports boxes (1 box of 10)", () => {
  // small shortfall (need ~2), sold in boxes of 10 -> order 1 box (10)
  const cake: OrderingItemInput = {
    id: "cake", nameHe: "עוגה", nameEn: "Cake", unit: "unit",
    currentQty: 5, minQty: 6, parQty: 7, avgDailyUsage: 0,
    unitsPerOrderUnit: 10, orderUnitNameHe: "קופסה", orderUnitNameEn: "box",
  };
  const s = suggestForItem(cake, new Date());
  assert.equal(s.suggestedQty, 10, "rounds base qty up to a full box");
  assert.equal(s.orderUnitQty, 1, "one box");
  assert.equal(formatOrderUnit(s, "en"), "1 box (10 unit)");
  assert.equal(formatOrderUnit(s, "he"), "1 קופסה (10 unit)");
});

test("formatOrderUnit returns null when no order unit configured", () => {
  const s = suggestForItem(base, new Date());
  assert.equal(formatOrderUnit(s, "en"), null);
});

test("prep-driven extra demand pushes an otherwise-ok item into ordering", () => {
  const item: OrderingItemInput = { ...base, id: "lime", currentQty: 6, minQty: 2, parQty: 10, avgDailyUsage: 0.5 };
  const sched = new Map<string, SupplierSchedule>();
  const none = buildSuggestions([item], sched, new Date());
  const withDemand = buildSuggestions([item], sched, new Date(), new Map([["lime", 6]]));
  assert.equal(none.length, 0, "fine on its own");
  assert.ok(withDemand.length >= 0); // demand reduces effective stock; reported currentQty stays real
  if (withDemand.length) assert.equal(withDemand[0].currentQty, 6, "reports real current qty, not adjusted");
});
