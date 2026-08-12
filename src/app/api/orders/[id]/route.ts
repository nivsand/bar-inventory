import { withRouteTiming } from "@/lib/perf";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { applyOrderReceiving } from "@/server/receiving";

async function PATCH__handler(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const body = await req.json(); // { status?, messageBody?, notes?, items?:[{id,orderedQty}] }
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

    // ARRIVED is the ONLY point where an order touches inventory: the reviewed
    // received quantities are applied through the stock ledger. Idempotent —
    // re-entering ARRIVED never doubles stock (see applyOrderReceiving).
    if (body.status === "ARRIVED" && before.status !== "ARRIVED") {
      await prisma.$transaction((tx) => applyOrderReceiving(tx, { orderId: params.id, userId: user.id }));
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
      // A draft receiving review (never applied to stock) must not block the delete.
      await prisma.delivery.deleteMany({ where: { orderId: params.id, confirmed: false } });
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
