import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest, notFound } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { z } from "zod";

// id = prepItemId. Manager/Admin only. Replaces the ingredient list and yield.
const schema = z.object({
  yieldQty: z.coerce.number().positive().optional(),
  instructions: z.string().nullable().optional(),
  ingredients: z.array(z.object({
    itemId: z.string().min(1),
    qtyPerYield: z.coerce.number().nonnegative(),
    unit: z.string().min(1),
  })).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const body = schema.parse(await req.json());

    const prep = await prisma.prepItem.findUnique({ where: { id: params.id }, include: { item: true, recipe: true } });
    if (!prep) return notFound();

    await prisma.$transaction(async (tx) => {
      if (body.yieldQty !== undefined || body.instructions !== undefined) {
        await tx.prepItem.update({
          where: { id: params.id },
          data: {
            ...(body.yieldQty !== undefined ? { yieldQty: body.yieldQty } : {}),
            ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
          },
        });
      }

      if (body.ingredients) {
        // Ensure a recipe row exists.
        let recipe = prep.recipe;
        if (!recipe) {
          recipe = await tx.recipe.create({ data: { prepItemId: params.id, nameHe: prep.item.nameHe, nameEn: prep.item.nameEn } });
        }
        // Replace ingredient lines.
        await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
        for (const ing of body.ingredients) {
          if (ing.itemId === prep.itemId) continue; // a prep can't be its own ingredient
          await tx.recipeIngredient.create({ data: { recipeId: recipe.id, itemId: ing.itemId, qtyPerYield: ing.qtyPerYield, unit: ing.unit } });
        }
      }
    });

    await logAudit({ userId: user.id, entity: "Recipe", entityId: params.id, action: "UPDATE" });
    return ok({ ok: true });
  } catch (e: any) {
    if (e?.name === "ZodError") return badRequest("Invalid recipe");
    return serverError(e);
  }
}

// Delete a recipe (id = prepItemId). Manager/Admin only.
// If the prep product has history (counts, adjustments, prep tasks, used as an
// ingredient elsewhere, orders/deliveries/waste), soft-archive it; otherwise
// hard-delete the recipe + prep item + underlying inventory item.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const prep = await prisma.prepItem.findUnique({ where: { id: params.id }, include: { item: true } });
    if (!prep) return notFound();
    const itemId = prep.itemId;

    const [counts, adj, orders, deliveries, waste, usedAsIng, menuUse, tasks] = await prisma.$transaction([
      prisma.dailyCountEntry.count({ where: { itemId } }),
      prisma.inventoryAdjustment.count({ where: { itemId } }),
      prisma.orderItem.count({ where: { itemId } }),
      prisma.deliveryItem.count({ where: { itemId } }),
      prisma.wasteEntry.count({ where: { itemId } }),
      prisma.recipeIngredient.count({ where: { itemId } }), // this prep used inside other recipes
      prisma.menuRecipeItem.count({ where: { itemId } }),
      prisma.prepTask.count({ where: { prepItemId: params.id } }),
    ]);
    const hasHistory = counts + adj + orders + deliveries + waste + usedAsIng + menuUse + tasks > 0;

    let result: "deleted" | "archived";
    if (hasHistory) {
      await prisma.inventoryItem.update({ where: { id: itemId }, data: { isActive: false, deletedAt: new Date(), deletedById: user.id } });
      result = "archived";
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.prepItem.delete({ where: { id: params.id } }); // cascades recipe + ingredients
        await tx.inventoryItem.delete({ where: { id: itemId } });
      });
      result = "deleted";
    }

    await logAudit({ userId: user.id, entity: "Recipe", entityId: params.id, action: "DELETE", changes: { state: { old: "active", new: result } } });
    return ok({ ok: true, result });
  } catch (e) {
    return serverError(e);
  }
}
