import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { applyAdjustment } from "@/server/stock";
import { logAudit } from "@/server/audit";

// Manager/Admin reviews a received-goods report.
//  - APPROVE: applies received quantities to inventory (the only place a
//    delivery touches stock) and advances any linked order.
//  - REJECT: marks the report rejected; inventory is untouched.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const { action } = await req.json(); // "APPROVE" | "REJECT"
    const delivery = await prisma.delivery.findUnique({
      where: { id: params.id },
      include: { items: true },
    });
    if (!delivery) return badRequest("Report not found");
    if (delivery.status === "APPROVED") return badRequest("Already approved");

    if (action === "REJECT") {
      await prisma.delivery.update({
        where: { id: params.id },
        data: { status: "REJECTED", approvedById: user.id, approvedAt: new Date() },
      });
    } else if (action === "APPROVE") {
      await prisma.$transaction(async (tx) => {
        for (const di of delivery.items) {
          if (di.receivedQty > 0) {
            await applyAdjustment(tx, {
              itemId: di.itemId, delta: di.receivedQty, source: "DELIVERY",
              refType: "Delivery", refId: delivery.id, userId: user.id,
            });
          }
        }
        if (delivery.orderId) {
          const status = delivery.hasShortage ? "PARTIALLY_DELIVERED" : "ARRIVED";
          await tx.order.update({ where: { id: delivery.orderId }, data: { status } });
          await tx.orderStatusHistory.create({ data: { orderId: delivery.orderId, status, changedBy: user.id } });
        }
        await tx.delivery.update({
          where: { id: params.id },
          data: { status: "APPROVED", confirmed: true, approvedById: user.id, approvedAt: new Date() },
        });
      });
    } else {
      return badRequest("Invalid action");
    }

    await logAudit({
      userId: user.id, entity: "Delivery", entityId: params.id, action: "UPDATE",
      changes: { status: { old: delivery.status, new: action === "APPROVE" ? "APPROVED" : "REJECTED" } },
    });
    return ok({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
