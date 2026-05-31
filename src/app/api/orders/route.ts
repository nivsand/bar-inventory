import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";
import { logAudit } from "@/server/audit";

export async function GET() {
  try {
    await requireUser();
    const orders = await prisma.order.findMany({
      include: { supplier: true, items: { include: { item: true } }, createdBy: true },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    return ok(orders);
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const user = await requireManager();
    const { supplierId, items, channel } = await req.json();
    // items: [{itemId, suggestedQty, orderedQty, currentQty, minQty, reason, unit}]
    const order = await prisma.order.create({
      data: {
        supplierId, createdById: user.id, status: "NEED_TO_ORDER", channel: channel ?? undefined,
        items: { create: items.map((i: any) => ({
          itemId: i.itemId, suggestedQty: i.suggestedQty, orderedQty: i.orderedQty ?? i.suggestedQty,
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
