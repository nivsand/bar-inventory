import { withRouteTiming } from "@/lib/perf";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { logAudit } from "@/server/audit";

async function PATCH__handler(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const body = await req.json(); // { status?, messageBody?, notes?, items?:[{id,orderedQty}], addItems?:[{itemId,orderedQty}] }
    const before = await prisma.order.findUniqueOrThrow({ where: { id: params.id } });

    if (Array.isArray(body.addItems) && body.addItems.length) {
      const addItemIds = [...new Set(body.addItems.map((a: any) => a.itemId).filter(Boolean))] as string[];
      if (body.addItems.some((a: any) => !a.itemId || !(Number(a.orderedQty) > 0))) {
        return badRequest("Added products must include a positive quantity");
      }
      const addItems = await prisma.inventoryItem.findMany({ where: { id: { in: addItemIds }, isActive: true } });
      const itemById = new Map(addItems.map((item) => [item.id, item]));
      const invalid = addItemIds.find((id) => itemById.get(id)?.supplierId !== before.supplierId);
      if (invalid) return badRequest("Products from other suppliers cannot be added to this order");
    }

    const data: any = {};
    if (body.status) { data.status = body.status; if (body.status === "ORDERED") data.sentAt = new Date(); }
    if (body.messageBody !== undefined) data.messageBody = body.messageBody;
    if (body.notes !== undefined) data.notes = body.notes;

    const order = await prisma.order.update({ where: { id: params.id }, data });

    // Update existing line quantities.
    if (Array.isArray(body.items)) {
      for (const it of body.items) {
        await prisma.orderItem.update({ where: { id: it.id }, data: { orderedQty: Number(it.orderedQty) } });
      }
    }

    // Manually add extra items to an open order (manager/admin).
    if (Array.isArray(body.addItems) && body.addItems.length) {
      for (const a of body.addItems) {
        if (!a.itemId) continue;
        const item = await prisma.inventoryItem.findFirst({ where: { id: a.itemId, isActive: true } });
        if (!item) continue;
        const orderedQty = Number(a.orderedQty) || 0;
        await prisma.orderItem.upsert({
          where: { orderId_itemId: { orderId: params.id, itemId: a.itemId } },
          update: { orderedQty },
          create: {
            orderId: params.id, itemId: a.itemId, suggestedQty: orderedQty, orderedQty,
            purchasePriceSnapshot: item.purchasePrice,
            currentQty: item.currentQty, minQty: item.minQty, reason: "Manually added", unit: item.unit,
          },
        });
      }
    }

    if (body.status && body.status !== before.status) {
      await prisma.orderStatusHistory.create({ data: { orderId: params.id, status: body.status, changedBy: user.id } });
    }
    await logAudit({ userId: user.id, entity: "Order", entityId: params.id, action: "UPDATE", changes: body.status ? { status: { old: before.status, new: body.status } } : {} });
    return ok(order);
  } catch (e) { return serverError(e); }
}

// Delete an order. Manager/Admin only (employees blocked by requireManager).
// Only a draft (NEED_TO_ORDER) order can be hard-deleted. Once an order has
// been sent, hard-deleting it would silently free up its supplier's order
// cycle for a duplicate order, so it's cancelled instead: status becomes
// CANCELLED, the row (and its history) stays for the record.
async function DELETE__handler(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const order = await prisma.order.findUniqueOrThrow({ where: { id: params.id } });

    if (order.status === "NEED_TO_ORDER") {
      await prisma.order.delete({ where: { id: params.id } }); // items + history cascade
      await logAudit({ userId: user.id, entity: "Order", entityId: params.id, action: "DELETE" });
      return ok({ ok: true });
    }

    await prisma.order.update({ where: { id: params.id }, data: { status: "CANCELLED" } });
    await prisma.orderStatusHistory.create({ data: { orderId: params.id, status: "CANCELLED", changedBy: user.id } });
    await logAudit({ userId: user.id, entity: "Order", entityId: params.id, action: "UPDATE", changes: { status: { old: order.status, new: "CANCELLED" } } });
    return ok({ ok: true, cancelled: true });
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const PATCH = withRouteTiming("PATCH", "/api/orders/[id]", PATCH__handler);
export const DELETE = withRouteTiming("DELETE", "/api/orders/[id]", DELETE__handler);
