import { withRouteTiming } from "@/lib/perf";
import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError, badRequest } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { computeCycleStart } from "@/server/engines/ordering";
import { calculateOrderValue, compareOrdersByStatusThenDate } from "@/lib/orders";

async function GET__handler() {
  try {
    await requireUser();
    const orders = await prisma.order.findMany({
      include: { supplier: true, items: { include: { item: true } }, createdBy: true },
      orderBy: { createdAt: "desc" },
    });
    return ok(orders
      .sort(compareOrdersByStatusThenDate)
      .map((order) => ({
        ...order,
        currentOrderValue: calculateOrderValue(order.items),
        supplierMinimum: order.supplier.minOrderAmount ?? null,
      })));
  } catch (e) { return serverError(e); }
}

async function POST__handler(req: Request) {
  try {
    const user = await requireManager();
    const { supplierId, items, channel } = await req.json();
    if (!Array.isArray(items) || items.length === 0) return badRequest("Order must include at least one item");
    if (items.some((i: any) => !i.itemId)) return badRequest("Every order item must reference an inventory item");
    if (items.some((i: any) => !(Number(i.orderedQty ?? i.suggestedQty) > 0))) return badRequest("Order item quantities must be positive");

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) return badRequest("Supplier not found");
    const cycleStart = computeCycleStart(new Date(), supplier.orderDeadlineDays);
    const duplicate = await prisma.order.findFirst({
      where: { supplierId, status: { not: "CANCELLED" }, createdAt: { gte: cycleStart } },
    });
    if (duplicate) return badRequest("An active order already exists for this supplier's current order cycle");

    // items: [{itemId, suggestedQty, orderedQty, currentQty, minQty, reason, unit}]
    const itemIds = [...new Set(items.map((i: any) => i.itemId).filter(Boolean))] as string[];
    const inventoryItems = await prisma.inventoryItem.findMany({ where: { id: { in: itemIds }, isActive: true } });
    const itemById = new Map(inventoryItems.map((item) => [item.id, item]));
    const invalidItem = itemIds.find((id) => itemById.get(id)?.supplierId !== supplierId);
    if (invalidItem) return badRequest("Order items must belong to the selected supplier");

    const order = await prisma.order.create({
      data: {
        supplierId, createdById: user.id, status: "NEED_TO_ORDER", channel: channel ?? undefined,
        items: { create: items.map((i: any) => ({
          itemId: i.itemId, suggestedQty: i.suggestedQty, orderedQty: i.orderedQty ?? i.suggestedQty,
          purchasePriceSnapshot: itemById.get(i.itemId)?.purchasePrice ?? 0,
          currentQty: i.currentQty, minQty: i.minQty, reason: i.reason, unit: i.unit,
        })) },
        history: { create: { status: "NEED_TO_ORDER", changedBy: user.id } },
      },
      include: { supplier: true, items: { include: { item: true } } },
    });
    await logAudit({ userId: user.id, entity: "Order", entityId: order.id, action: "CREATE" });
    return created(order);
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const GET = withRouteTiming("GET", "/api/orders", GET__handler);
export const POST = withRouteTiming("POST", "/api/orders", POST__handler);
