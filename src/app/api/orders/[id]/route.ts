import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { logAudit } from "@/server/audit";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const body = await req.json(); // { status?, messageBody?, sentAt?, items?: [{id, orderedQty}] }
    const before = await prisma.order.findUniqueOrThrow({ where: { id: params.id } });

    const data: any = {};
    if (body.status) { data.status = body.status; if (body.status === "ORDERED") data.sentAt = new Date(); }
    if (body.messageBody !== undefined) data.messageBody = body.messageBody;
    if (body.notes !== undefined) data.notes = body.notes;

    const order = await prisma.order.update({ where: { id: params.id }, data });

    if (Array.isArray(body.items)) {
      for (const it of body.items) {
        await prisma.orderItem.update({ where: { id: it.id }, data: { orderedQty: it.orderedQty } });
      }
    }
    if (body.status && body.status !== before.status) {
      await prisma.orderStatusHistory.create({ data: { orderId: params.id, status: body.status, changedBy: user.id } });
    }
    await logAudit({ userId: user.id, entity: "Order", entityId: params.id, action: "UPDATE", changes: body.status ? { status: { old: before.status, new: body.status } } : {} });
    return ok(order);
  } catch (e) { return serverError(e); }
}
