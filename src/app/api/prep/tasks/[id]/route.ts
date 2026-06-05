import { requireManager, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { applyBatchAdjustments } from "@/server/stock";
import { logAudit } from "@/server/audit";

// PATCH a prep task.
//  - { action: "COMPLETE", producedQty? }  -> mark done (any user). Consumes
//    ingredients (from the LATEST recipe) and produces the prep item, all
//    through the stock ledger.
//  - otherwise -> edit fields (manager/admin only).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();

    if (body.action === "COMPLETE") {
      const user = await requireUser();
      await prisma.$transaction(async (tx) => {
        const task = await tx.prepTask.findUniqueOrThrow({
          where: { id: params.id },
          include: { prepItem: { include: { item: true, recipe: { include: { ingredients: true } } } } },
        });
        const produced = body.producedQty != null ? Number(body.producedQty) : task.targetQty;
        const yieldQty = task.prepItem.yieldQty || 1;
        const batches = yieldQty > 0 ? produced / yieldQty : produced;

        // Batch: 1 findMany + N updates + 1 createMany instead of 3N round trips.
        const consumptions = (task.prepItem.recipe?.ingredients ?? []).map((ing) => ({
          itemId: ing.itemId,
          delta: -(ing.qtyPerYield * batches),
          source: "PREP_CONSUMPTION" as const,
          refType: "PrepTask", refId: task.id, userId: user.id,
        }));
        await applyBatchAdjustments(tx, [
          ...consumptions,
          { itemId: task.prepItem.itemId, delta: produced, source: "PREP_PRODUCTION" as const, refType: "PrepTask", refId: task.id, userId: user.id },
        ]);
        await tx.prepTask.update({ where: { id: task.id }, data: { status: "DONE", producedQty: produced } });
      });
      await logAudit({ userId: user.id, entity: "PrepTask", entityId: params.id, action: "UPDATE", changes: { status: { old: null, new: "DONE" } } });
      return ok({ ok: true });
    }

    // Edit (manager/admin only)
    const user = await requireManager();
    const data: any = {};
    if (body.targetQty !== undefined) data.targetQty = Number(body.targetQty);
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.status !== undefined) data.status = body.status;
    if (body.reason !== undefined) data.reason = body.reason;
    const task = await prisma.prepTask.update({ where: { id: params.id }, data });
    await logAudit({ userId: user.id, entity: "PrepTask", entityId: params.id, action: "UPDATE" });
    return ok(task);
  } catch (e) {
    return serverError(e);
  }
}

// Delete a prep task. Manager/Admin only.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    await prisma.prepTask.delete({ where: { id: params.id } });
    await logAudit({ userId: user.id, entity: "PrepTask", entityId: params.id, action: "DELETE" });
    return ok({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
