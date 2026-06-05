import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { buildSuggestions, SupplierSchedule, OrderingItemInput } from "@/server/engines/ordering";
import { suggestPrep, aggregateIngredientDemand, PrepInput } from "@/server/engines/prep";

export async function GET() {
  try {
    await requireManager();
    const today = new Date();

    // Run all three independent DB queries in parallel instead of serially.
    const [suppliers, rawItems, prepItems] = await Promise.all([
      prisma.supplier.findMany({ where: { isActive: true } }),
      prisma.inventoryItem.findMany({ where: { isActive: true, kind: "RAW" }, include: { supplier: true } }),
      prisma.prepItem.findMany({
        include: { item: true, recipe: { include: { ingredients: { include: { item: true } } } } },
      }),
    ]);

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
      packSize: i.packSize, orderMultiple: i.orderMultiple, supplierId: i.supplierId,
      unitsPerOrderUnit: i.unitsPerOrderUnit, orderUnitNameHe: i.orderUnitNameHe, orderUnitNameEn: i.orderUnitNameEn,
    }));

    const suggestions = buildSuggestions(inputs, scheduleBySupplier, today, extraDemand);

    // Group by supplier
    const bySupplier = suppliers.map((s) => ({
      supplier: s,
      items: suggestions.filter((sug) => rawItems.find((r) => r.id === sug.itemId)?.supplierId === s.id),
    })).filter((g) => g.items.length > 0);

    const noSupplier = suggestions.filter((sug) => !rawItems.find((r) => r.id === sug.itemId)?.supplierId);

    return ok({ bySupplier, noSupplier, prepDemandConsidered: extraDemand.size });
  } catch (e) { return serverError(e); }
}
