// Always render fresh from the DB.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

// Read-only diagnostics for the prep/inventory link issue. Admin only.
// Open /api/diagnostics/prep in the browser to see, from the live database:
//   - duplicate inventory items (same name)
//   - every recipe ingredient line: which InventoryItem it links to, that
//     item's current stock, unit, and whether it is active/archived.
export async function GET() {
  try {
    await requireAdmin();

    const items = await prisma.inventoryItem.findMany({
      select: { id: true, nameHe: true, nameEn: true, currentQty: true, unit: true, kind: true, isActive: true },
      orderBy: { nameEn: "asc" },
    });

    // Group by normalized name to expose duplicates.
    const norm = (s: string) => s.trim().toLowerCase();
    const byName = new Map<string, typeof items>();
    for (const it of items) {
      const k = norm(it.nameEn) + "|" + norm(it.nameHe);
      const arr = byName.get(k) ?? [];
      arr.push(it);
      byName.set(k, arr);
    }
    const duplicates = [...byName.values()].filter((g) => g.length > 1);

    const recipeLinks = await prisma.recipeIngredient.findMany({
      include: {
        recipe: { include: { prepItem: { include: { item: { select: { nameEn: true } } } } } },
        item: { select: { id: true, nameHe: true, nameEn: true, currentQty: true, unit: true, isActive: true } },
      },
    });

    const links = recipeLinks.map((ri) => ({
      recipeIngredientId: ri.id,
      prepItem: ri.recipe?.prepItem?.item?.nameEn,
      linkedItemId: ri.itemId,
      linkedItemName: ri.item.nameEn,
      linkedItemNameHe: ri.item.nameHe,
      currentQty: ri.item.currentQty,
      itemUnit: ri.item.unit,
      recipeUnit: ri.unit,
      qtyPerYield: ri.qtyPerYield,
      itemActive: ri.item.isActive,
    }));

    return ok({
      summary: {
        totalItems: items.length,
        duplicateNameGroups: duplicates.length,
        recipeIngredientLines: links.length,
        linksToArchivedItems: links.filter((l) => !l.itemActive).length,
      },
      duplicates,
      recipeLinks: links,
    });
  } catch (e) {
    return serverError(e);
  }
}
