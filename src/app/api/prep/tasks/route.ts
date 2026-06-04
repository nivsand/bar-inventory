// Always render fresh from the DB — never serve cached/stale data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireManager, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError, badRequest } from "@/lib/api";

// GET: list prep tasks. The ingredient breakdown for each open task is computed
// LIVE from the latest recipe + current inventory (never a stored snapshot).
export async function GET() {
  try {
    await requireUser();
    const tasks = await prisma.prepTask.findMany({
      include: {
        prepItem: {
          include: {
            item: true,
            recipe: { include: { ingredients: { include: { item: { select: { id: true, nameHe: true, nameEn: true, currentQty: true } } } } } },
          },
        },
        assignee: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const result = tasks.map((tk) => {
      const yieldQty = tk.prepItem.yieldQty || 1;
      const batches = yieldQty > 0 ? tk.targetQty / yieldQty : tk.targetQty;
      const ingredients = (tk.prepItem.recipe?.ingredients ?? []).map((ri) => {
        const required = round(ri.qtyPerYield * batches);
        const available = ri.item.currentQty;
        const shortfall = Math.max(0, round(required - available));
        return { itemId: ri.itemId, nameHe: ri.item.nameHe, nameEn: ri.item.nameEn, unit: ri.unit, required, available, shortfall };
      });
      return { ...tk, ingredients, ingredientsOk: ingredients.every((i) => i.shortfall <= 0) };
    });

    return ok(result);
  } catch (e) {
    return serverError(e);
  }
}

// POST: create a prep task (manager/admin only). Stores only the target qty —
// the ingredient list is always derived live from the recipe, not snapshotted.
export async function POST(req: Request) {
  try {
    await requireManager();
    const body = await req.json();
    if (!body.prepItemId || body.targetQty == null) return badRequest("prepItemId and targetQty required");
    const task = await prisma.prepTask.create({
      data: {
        prepItemId: body.prepItemId,
        targetQty: Number(body.targetQty),
        reason: body.reason ?? null,
        status: "PLANNED",
        assigneeId: body.assigneeId ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    });
    return created(task);
  } catch (e) {
    return serverError(e);
  }
}

function round(n: number) { return Math.round(n * 1000) / 1000; }
