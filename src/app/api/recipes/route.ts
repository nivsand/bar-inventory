// Always render fresh from the DB — never serve cached/stale data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError, badRequest } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { z } from "zod";

// List every (active) prep item with its recipe + ingredient lines.
export async function GET() {
  try {
    await requireUser();
    const prepItems = await prisma.prepItem.findMany({
      where: { item: { isActive: true } },
      include: {
        item: true,
        recipe: { include: { ingredients: { include: { item: true } } } },
      },
      orderBy: { item: { nameEn: "asc" } },
    });
    return ok(prepItems);
  } catch (e) {
    return serverError(e);
  }
}

// Create a new prep recipe. Manager/Admin only. This creates the underlying
// PREP inventory item + PrepItem + Recipe + ingredient lines in one go.
const schema = z.object({
  nameHe: z.string().min(1),
  nameEn: z.string().min(1),
  unit: z.string().min(1),
  area: z.enum(["KITCHEN", "FLOOR"]).default("KITCHEN"),
  yieldQty: z.coerce.number().positive().default(1),
  minQty: z.coerce.number().nonnegative().default(0),
  parQty: z.coerce.number().nonnegative().default(0),
  shelfLifeDays: z.coerce.number().nullable().optional(),
  instructions: z.string().nullable().optional(),
  ingredients: z.array(z.object({
    itemId: z.string().min(1),
    qtyPerYield: z.coerce.number().nonnegative(),
    unit: z.string().min(1),
  })).default([]),
});

export async function POST(req: Request) {
  try {
    const user = await requireManager();
    const data = schema.parse(await req.json());

    // Prevent duplicate prep products (the cause of duplicate "guacamole" rows).
    const dup = await prisma.inventoryItem.findFirst({
      where: { isActive: true, kind: "PREP", OR: [{ nameEn: data.nameEn }, { nameHe: data.nameHe }] },
      select: { id: true },
    });
    if (dup) return badRequest("A prep item with this name already exists. Edit it instead of creating a duplicate.");

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: {
          nameHe: data.nameHe, nameEn: data.nameEn, unit: data.unit, kind: "PREP",
          area: data.area, currentQty: 0, minQty: data.minQty, parQty: data.parQty,
          shelfLifeDays: data.shelfLifeDays ?? null,
        },
      });
      const prep = await tx.prepItem.create({
        data: { itemId: created.id, yieldQty: data.yieldQty, shelfLifeDays: data.shelfLifeDays ?? null, instructions: data.instructions ?? null },
      });
      const recipe = await tx.recipe.create({ data: { prepItemId: prep.id, nameHe: data.nameHe, nameEn: data.nameEn } });
      for (const ing of data.ingredients) {
        if (ing.itemId === created.id) continue;
        await tx.recipeIngredient.create({ data: { recipeId: recipe.id, itemId: ing.itemId, qtyPerYield: ing.qtyPerYield, unit: ing.unit } });
      }
      return { prepItemId: prep.id, itemId: created.id };
    });

    await logAudit({ userId: user.id, entity: "Recipe", entityId: item.prepItemId, action: "CREATE" });
    return created(item);
  } catch (e: any) {
    if (e?.name === "ZodError") return badRequest("Invalid recipe");
    return serverError(e);
  }
}