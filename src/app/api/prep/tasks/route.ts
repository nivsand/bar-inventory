import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";
import { applyAdjustment } from "@/server/stock";

export async function GET() {
  try {
    await requireUser();
    const tasks = await prisma.prepTask.findMany({
      // Include the LATEST recipe + ingredient current stock so the task's
      // ingredient list is always computed from current inventory and the
      // up-to-date recipe (not a snapshot taken at creation time).
      include: {
        prepItem: {
          include: {
            item: true,
            recipe: { include: { ingredients: { include: { item: { select: { id: true, nameHe: true, nameEn: true, currentQty: true, unit: true } } } } } },
          },
        },
        assignee: true,
      },
      orderBy: { createdAt: "desc" }, take: 100,
    });

    // Compute required / available / shortage live for each open task.
    const withBreakdown = tasks.map((tk) => {
      const yieldQty = tk.prepItem.yieldQty || 1;
      const batches = yieldQty > 0 ? tk.targetQty / yieldQty : tk.targetQty;
      const ingredients = (tk.prepItem.recipe?.ingredients ?? []).map((ri) => {
        const required = Math.round(ri.qtyPerYield * batches * 1000) / 1000;
        const available = ri.item.currentQty;
        const shortfall = Math.max(0, Math.round((required - available) * 1000) / 1000);
        return { itemId: ri.itemId, nameHe: ri.item.nameHe, nameEn: ri.item.nameEn, unit: ri.unit, required, available, shortfall };
      });
      const ingredientsOk = ingredients.every((i) => i.shortfall <= 0);
      return { ...tk, ingredients, ingredientsOk };
    });

    return ok(withBreakdown);
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
