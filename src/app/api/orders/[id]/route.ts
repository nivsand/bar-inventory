import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { logAudit } from "@/server/audit";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const body = await req.json(); // { status?, messageBody?, notes?, items?:[{id,orderedQty}], addItems?:[{itemId,orderedQty}] }
    const before = await prisma.order.findUniqueOrThrow({ where: { id: params.id } });

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
        const item = await prisma.inventoryItem.findUnique({ where: { id: a.itemId } });
        if (!item) continue;
        const orderedQty = Number(a.orderedQty) || 0;
        await prisma.orderItem.upsert({
          where: { orderId_itemId: { orderId: params.id, itemId: a.itemId } },
          update: { orderedQty },
          create: {
            orderId: params.id, itemId: a.itemId, suggestedQty: orderedQty, orderedQty,
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
// If the order already has received-goods deliveries linked, refuse with a
// clear message instead of crashing on the foreign-key constraint.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    try {
      await prisma.order.delete({ where: { id: params.id } }); // items + history cascade
    } catch (e: any) {
      if (e?.code === "P2003" || e?.code === "P2014") {
        return badRequest("Cannot delete: this order has linked deliveries. Cancel it instead.");
      }
      throw e;
    }
    await logAudit({ userId: user.id, entity: "Order", entityId: params.id, action: "DELETE" });
    return ok({ ok: true });
  } catch (e) { return serverError(e); }
}
