import { prisma } from "@/lib/prisma";

export type DeleteResult = "deleted" | "archived";

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
