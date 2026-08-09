import { withRouteTiming } from "@/lib/perf";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { buildMinimumOrderSuggestions, buildSuggestions, SupplierSchedule, OrderingItemInput } from "@/server/engines/ordering";
import { suggestPrep, aggregateIngredientDemand, PrepInput } from "@/server/engines/prep";
import { calculateOrderValue } from "@/lib/orders";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function GET__handler() {
  try {
    await requireManager();
    const today = new Date();
    const recommendationDate = startOfToday();
    const dow = today.getDay();

    // Run all three independent DB queries in parallel instead of serially.
    const [suppliers, rawItems, prepItems, dismissals] = await Promise.all([
      prisma.supplier.findMany({ where: { isActive: true } }),
      prisma.inventoryItem.findMany({
        where: { isActive: true, kind: "RAW" },
        select: {
          id: true,
          nameHe: true,
          nameEn: true,
          unit: true,
          currentQty: true,
          minQty: true,
          parQty: true,
          avgDailyUsage: true,
          purchasePrice: true,
          packSize: true,
          orderMultiple: true,
          supplierId: true,
          unitsPerOrderUnit: true,
          orderUnitNameHe: true,
          orderUnitNameEn: true,
          messageUnitHe: true,
          messageUnitEn: true,
          showBaseQuantityInMessage: true,
        },
      }),
      prisma.prepItem.findMany({
        select: {
          id: true,
          itemId: true,
          yieldQty: true,
          item: { select: { nameHe: true, nameEn: true, unit: true, currentQty: true, minQty: true, parQty: true } },
          recipe: {
            select: {
              ingredients: {
                select: {
                  itemId: true,
                  qtyPerYield: true,
                  unit: true,
                  item: { select: { nameHe: true, nameEn: true, currentQty: true } },
                },
              },
            },
          },
        },
      }),
      prisma.orderRecommendationDismissal.findMany({ where: { recommendationDate }, select: { supplierId: true } }),
    ]);
    const dismissedSupplierIds = new Set(dismissals.map((d) => d.supplierId));

    const scheduleBySupplier = new Map<string, SupplierSchedule>(
      suppliers.map((s) => [s.id, { id: s.id, orderDeadlineDays: s.orderDeadlineDays, deliveryDays: s.deliveryDays, leadTimeDays: s.leadTimeDays }])
    );

    // Prep demand: any ingredient needed to bring prep items up to par adds demand.
    const prepSuggestions = prepItems
      .map((p) => {
        if (!p.recipe) return null;
        const input: PrepInput = {
          prepItemId: p.id, itemId: p.itemId, nameHe: p.item.nameHe, nameEn: p.item.nameEn, unit: p.item.unit,
          currentQty: p.item.currentQty, minQty: p.item.minQty, parQty: p.item.parQty, yieldQty: p.yieldQty,
          ingredients: p.recipe.ingredients.map((ri) => ({
            itemId: ri.itemId, nameHe: ri.item.nameHe, nameEn: ri.item.nameEn,
            qtyPerYield: ri.qtyPerYield, unit: ri.unit, availableQty: ri.item.currentQty,
          })),
        };
        return suggestPrep(input);
      })
      .filter(Boolean) as any[];
    const extraDemand = aggregateIngredientDemand(prepSuggestions);

    const inputs: OrderingItemInput[] = rawItems.map((i) => ({
      id: i.id, nameHe: i.nameHe, nameEn: i.nameEn, unit: i.unit,
      currentQty: i.currentQty, minQty: i.minQty, parQty: i.parQty, avgDailyUsage: i.avgDailyUsage,
      purchasePrice: i.purchasePrice,
      packSize: i.packSize, orderMultiple: i.orderMultiple, supplierId: i.supplierId,
      unitsPerOrderUnit: i.unitsPerOrderUnit, orderUnitNameHe: i.orderUnitNameHe, orderUnitNameEn: i.orderUnitNameEn,
      messageUnitHe: i.messageUnitHe, messageUnitEn: i.messageUnitEn, showBaseQuantityInMessage: i.showBaseQuantityInMessage,
    }));

    const suggestions = buildSuggestions(inputs, scheduleBySupplier, today, extraDemand);

    // Group by supplier. Always include suppliers scheduled today even with no shortages.
    const itemSupplierById = new Map(rawItems.map((i) => [i.id, i.supplierId]));
    const scheduledTodayIds = new Set(suppliers.filter((s) => s.orderDeadlineDays.includes(dow)).map((s) => s.id));
    const bySupplier = suppliers
      .filter((s) => {
        if (dismissedSupplierIds.has(s.id)) return false;
        const hasItems = suggestions.some((sug) => itemSupplierById.get(sug.itemId) === s.id);
        return hasItems || scheduledTodayIds.has(s.id);
      })
      .map((s) => {
        const items = suggestions.filter((sug) => itemSupplierById.get(sug.itemId) === s.id);
        const currentOrderValue = calculateOrderValue(items);
        const supplierMinimum = s.minOrderAmount ?? null;
        const existingItemIds = new Set(items.map((it) => it.itemId));
        const topUpSuggestions = supplierMinimum != null && currentOrderValue < supplierMinimum
          ? buildMinimumOrderSuggestions(inputs, scheduleBySupplier, today, s.id, existingItemIds, extraDemand)
          : [];
        return {
          supplier: s,
          items,
          scheduledToday: scheduledTodayIds.has(s.id),
          currentOrderValue,
          supplierMinimum,
          minimumMet: supplierMinimum == null || currentOrderValue >= supplierMinimum,
          topUpSuggestions,
        };
      });

    const noSupplier = suggestions.filter((sug) => !itemSupplierById.get(sug.itemId));

    return ok({ bySupplier, noSupplier, prepDemandConsidered: extraDemand.size });
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const GET = withRouteTiming("GET", "/api/orders/suggestions", GET__handler);
