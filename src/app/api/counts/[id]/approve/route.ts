import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { setAbsoluteStock } from "@/server/stock";
import { logAudit } from "@/server/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const { action } = await req.json(); // "APPROVE" | "REJECT" | "RECOUNT"
    const count = await prisma.dailyCount.findUniqueOrThrow({ where: { id: params.id }, include: { entries: true } });

    if (action === "REJECT") {
      await prisma.dailyCount.update({ where: { id: params.id }, data: { status: "REJECTED" } });
    } else if (action === "RECOUNT") {
      await prisma.dailyCount.update({ where: { id: params.id }, data: { status: "DRAFT" } });
    } else if (action === "APPROVE") {
      await prisma.$transaction(async (tx) => {
        for (const e of count.entries) {
          // Daily count is the source of truth -> set absolute stock.
          await setAbsoluteStock(tx, {
            itemId: e.itemId, countedQty: e.countedQty, source: "DAILY_COUNT",
            refType: "DailyCount", refId: count.id, userId: user.id,
          });
        }
        await tx.dailyCount.update({
          where: { id: params.id },
          data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() },
        });
      });
    } else return badRequest("Invalid action");

    await logAudit({ userId: user.id, entity: "DailyCount", entityId: params.id, action: "UPDATE", changes: { status: { old: count.status, new: action } } });
    return ok({ ok: true });
  } catch (e) { return serverError(e); }
}
