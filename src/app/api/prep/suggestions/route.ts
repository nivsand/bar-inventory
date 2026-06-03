// Always render fresh from the DB — never serve cached/stale data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { suggestPrep, PrepInput } from "@/server/engines/prep";

export async function GET() {
  try {
    await requireUser();
    const prepItems = await prisma.prepItem.findMany({
      include: { item: true, recipe: { include: { ingredients: { include: { item: true } } } } },
    });
    const suggestions = prepItems.map((p) => {
      if (!p.recipe) return null;
      const input: PrepInput = {
        prepItemId: p.id, itemId: p.itemId, nameHe: p.item.nameHe, nameEn: p.item.nameEn, unit: p.item.unit,
        currentQty: p.item.currentQty, minQty: p.item.minQty, parQty: p.item.parQty, yieldQty: p.yieldQty,
        ingredients: p.recipe.ingredients.map((ri) => ({
          itemId: ri.itemId, nameHe: ri.item.nameHe, nameEn: ri.item.nameEn,
          qtyPerYield: ri.qtyPerYield, unit: ri.unit, availableQty: ri.item.currentQty,
        })),
      };
      return suggestPrep(input);
    }).filter(Boolean);
    return ok(suggestions);
  } catch (e) { return serverError(e); }
}