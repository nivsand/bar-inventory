import { prisma } from "@/lib/prisma";

export type DeleteResult = "deleted" | "archived";

// Thrown when an item can't be permanently deleted because real history/relations
// reference it. `reasons` is a human-readable list (e.g. "stock history (4)").
export class ItemReferencedError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super("Item is referenced by: " + reasons.join(", "));
    this.name = "ItemReferencedError";
    this.reasons = reasons;
  }
}

/**
 * Which records BLOCK a permanent delete. The item's own prep definition
 * (PrepItem + Recipe + its ingredient lines) is NOT blocking — it is removed
 * together with the item. Being used as an ingredient elsewhere, or having any
 * count/order/delivery/waste/stock history, IS blocking.
 */
export async function itemBlockingRefs(itemId: string): Promise<string[]> {
  const [counts, orders, deliveries, waste, adjustments, usedAsIngredient, menuUse] = await prisma.$transaction([
    prisma.dailyCountEntry.count({ where: { itemId } }),
    prisma.orderItem.count({ where: { itemId } }),
    prisma.deliveryItem.count({ where: { itemId } }),
    prisma.wasteEntry.count({ where: { itemId } }),
    prisma.inventoryAdjustment.count({ where: { itemId } }),
    prisma.recipeIngredient.count({ where: { itemId } }), // used as an ingredient in some recipe
    prisma.menuRecipeItem.count({ where: { itemId } }),
  ]);
  const r: string[] = [];
  if (counts) r.push(`counts (${counts})`);
  if (orders) r.push(`orders (${orders})`);
  if (deliveries) r.push(`deliveries (${deliveries})`);
  if (waste) r.push(`waste (${waste})`);
  if (adjustments) r.push(`stock history (${adjustments})`);
  if (usedAsIngredient) r.push(`used in recipes (${usedAsIngredient})`);
  if (menuUse) r.push(`menu (${menuUse})`);
  return r;
}

/**
 * Permanently delete an inventory item. Throws ItemReferencedError (with
 * reasons) if blocked by history/relations; the caller keeps it archived.
 * The item's own PrepItem/Recipe are deleted with it (so prep items are
 * deletable when nothing else references them).
 */
export async function hardDeleteItem(itemId: string): Promise<void> {
  const reasons = await itemBlockingRefs(itemId);
  if (reasons.length) throw new ItemReferencedError(reasons);
  await prisma.$transaction(async (tx) => {
    await tx.prepItem.deleteMany({ where: { itemId } }); // cascades Recipe + RecipeIngredient
    await tx.inventoryItem.delete({ where: { id: itemId } });
  });
}

/**
 * Delete an inventory item if it has NO related history; otherwise soft-archive
 * it (isActive=false + deletedAt + deletedById) so existing counts, orders,
 * deliveries, waste, adjustments, recipes and menu lines keep resolving.
 */
export async function deleteOrArchiveItem(itemId: string, userId: string): Promise<DeleteResult> {
  const [counts, orders, deliveries, waste, adjustments, recipeUse, menuUse, prep] = await prisma.$transaction([
    prisma.dailyCountEntry.count({ where: { itemId } }),
    prisma.orderItem.count({ where: { itemId } }),
    prisma.deliveryItem.count({ where: { itemId } }),
    prisma.wasteEntry.count({ where: { itemId } }),
    prisma.inventoryAdjustment.count({ where: { itemId } }),
    prisma.recipeIngredient.count({ where: { itemId } }),
    prisma.menuRecipeItem.count({ where: { itemId } }),
    prisma.prepItem.count({ where: { itemId } }),
  ]);
  const hasHistory = counts + orders + deliveries + waste + adjustments + recipeUse + menuUse + prep > 0;

  if (!hasHistory) {
    try {
      await prisma.inventoryItem.delete({ where: { id: itemId } });
      return "deleted";
    } catch (e: any) {
      if (e?.code !== "P2003" && e?.code !== "P2014") throw e; // fall through to archive on FK
    }
  }
  await prisma.inventoryItem.update({
    where: { id: itemId },
    data: { isActive: false, deletedAt: new Date(), deletedById: userId },
  });
  return "archived";
}

/**
 * Delete a supplier if it has no related items or orders (delivery history is
 * reached through orders); otherwise soft-archive it.
 */
export async function deleteOrArchiveSupplier(supplierId: string, userId: string): Promise<DeleteResult> {
  const [items, orders] = await prisma.$transaction([
    prisma.inventoryItem.count({ where: { supplierId } }),
    prisma.order.count({ where: { supplierId } }),
  ]);
  const hasHistory = items + orders > 0;

  if (!hasHistory) {
    try {
      await prisma.supplier.delete({ where: { id: supplierId } });
      return "deleted";
    } catch (e: any) {
      if (e?.code !== "P2003" && e?.code !== "P2014") throw e;
    }
  }
  await prisma.supplier.update({
    where: { id: supplierId },
    data: { isActive: false, deletedAt: new Date(), deletedById: userId },
  });
  return "archived";
}
