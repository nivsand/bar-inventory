import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";
import { applyAdjustment } from "@/server/stock";

export async function GET() {
  try {
    await requireUser();
    const tasks = await prisma.prepTask.findMany({
      include: { prepItem: { include: { item: true } }, assignee: true },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    return ok(tasks);
  } catch (e) { return serverError(e); }
}

// Create a prep task (manager/admin only), or complete one.
// Completing a task (mark done) is allowed for any authenticated user, so an
// employee can close out an assigned prep task.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "COMPLETE" && body.taskId) {
      const user = await requireUser();
      await prisma.$transaction(async (tx) => {
        const task = await tx.prepTask.findUniqueOrThrow({
          where: { id: body.taskId },
          include: { prepItem: { include: { recipe: { include: { ingredients: true } }, item: true } } },
        });
        const produced = body.producedQty ?? task.targetQty;
        const batches = task.prepItem.yieldQty > 0 ? produced / task.prepItem.yieldQty : produced;
        // consume ingredients
        for (const ing of task.prepItem.recipe?.ingredients ?? []) {
          await applyAdjustment(tx, { itemId: ing.itemId, delta: -ing.qtyPerYield * batches, source: "PREP_CONSUMPTION", refType: "PrepTask", refId: task.id, userId: user.id });
        }
        // produce prep item
        await applyAdjustment(tx, { itemId: task.prepItem.itemId, delta: produced, source: "PREP_PRODUCTION", refType: "PrepTask", refId: task.id, userId: user.id });
        await tx.prepTask.update({ where: { id: task.id }, data: { status: "DONE", producedQty: produced } });
      });
      return ok({ ok: true });
    }
    // Creating a task requires manager/admin.
    await requireManager();
    const task = await prisma.prepTask.create({
      data: {
        prepItemId: body.prepItemId, targetQty: body.targetQty, reason: body.reason ?? null,
        status: "PLANNED", assigneeId: body.assigneeId ?? null, ingredientsOk: body.ingredientsOk ?? true,
        shortfallJson: body.shortfallJson ?? null, dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    });
    return created(task);
  } catch (e) { return serverError(e); }
}
