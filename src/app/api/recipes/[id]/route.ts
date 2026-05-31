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
