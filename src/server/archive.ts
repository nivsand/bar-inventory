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

export type BulkDeleteResult = {
  deleted: string[];
  failed: { id: string; reasons: string[] }[];
};

/**
 * Batched bulk permanent delete. Instead of 7 reference checks per item run
 * sequentially (7×N round trips), this runs ONE set-based check per relation
 * across ALL ids in parallel (7 queries total), then deletes the unreferenced
 * items in a single transaction (2 statements). Total ≈ a couple of round
 * trips regardless of N. Items with references are returned with reasons and
 * are NOT deleted (the caller keeps them archived).
 */
export async function bulkHardDelete(ids: string[]): Promise<BulkDeleteResult> {
  if (ids.length === 0) return { deleted: [], failed: [] };

  const sel = { itemId: true } as const;
  const where = { itemId: { in: ids } };
  const [counts, orders, deliveries, waste, adjustments, usedAsIngredient, menuUse] = await Promise.all([
    prisma.dailyCountEntry.findMany({ where, select: sel, distinct: ["itemId"] }),
    prisma.orderItem.findMany({ where, select: sel, distinct: ["itemId"] }),
    prisma.deliveryItem.findMany({ where, select: sel, distinct: ["itemId"] }),
    prisma.wasteEntry.findMany({ where, select: sel, distinct: ["itemId"] }),
    prisma.inventoryAdjustment.findMany({ where, select: sel, distinct: ["itemId"] }),
    prisma.recipeIngredient.findMany({ where, select: sel, distinct: ["itemId"] }),
    prisma.menuRecipeItem.findMany({ where, select: sel, distinct: ["itemId"] }),
  ]);

  const reasonsById = new Map<string, string[]>();
  const tag = (rows: { itemId: string }[], label: string) => {
    for (const r of rows) {
      const arr = reasonsById.get(r.itemId) ?? [];
      if (!arr.includes(label)) arr.push(label);
      reasonsById.set(r.itemId, arr);
    }
  };
  tag(counts, "counts");
  tag(orders, "orders");
  tag(deliveries, "deliveries");
  tag(waste, "waste");
  tag(adjustments, "stock history");
  tag(usedAsIngredient, "used in recipes");
  tag(menuUse, "menu");

  const deletable = ids.filter((id) => !reasonsById.has(id));
  const failed = ids.filter((id) => reasonsById.has(id)).map((id) => ({ id, reasons: reasonsById.get(id)! }));

  if (deletable.length) {
    await prisma.$transaction([
      prisma.prepItem.deleteMany({ where: { itemId: { in: deletable } } }),
      prisma.inventoryItem.deleteMany({ where: { id: { in: deletable } } }),
    ]);
  }

  return { deleted: deletable, failed };
}

export type ForceDeleteResult = {
  deleted: string[];
  failed: { id: string; reasons: string[] }[];
};

/**
 * ADMIN FORCE DELETE — destructive. Permanently removes the given items AND all
 * dependent history rows that reference them, so the FK constraints are
 * satisfied and the items can be deleted. ONLY operates on ARCHIVED items
 * (isActive=false); active ids are rejected. Dependent rows are DELETED (not
 * orphaned) so reports/history that join on them won't hit dangling references.
 *
 * Batched: a single transaction with set-based deleteMany across all ids, so it
 * is fast regardless of how many items are selected.
 */
export async function forceDeleteItems(ids: string[], userId: string): Promise<ForceDeleteResult> {
  if (ids.length === 0) return { deleted: [], failed: [] };

  // Only archived items may be force-deleted.
  const rows = await prisma.inventoryItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, isActive: true },
  });
  const found = new Set(rows.map((r) => r.id));
  const archived = rows.filter((r) => !r.isActive).map((r) => r.id);
  const failed: { id: string; reasons: string[] }[] = [];
  for (const id of ids) {
    if (!found.has(id)) failed.push({ id, reasons: ["not found"] });
    else if (!archived.includes(id)) failed.push({ id, reasons: ["item is active — archive it first"] });
  }
  if (archived.length === 0) return { deleted: [], failed };

  const where = { itemId: { in: archived } };
  try {
    await prisma.$transaction([
      prisma.inventoryAdjustment.deleteMany({ where }),   // stock history / ledger
      prisma.dailyCountEntry.deleteMany({ where }),
      prisma.orderItem.deleteMany({ where }),
      prisma.deliveryItem.deleteMany({ where }),
      prisma.wasteEntry.deleteMany({ where }),
      prisma.recipeIngredient.deleteMany({ where }),      // used-as-ingredient lines
      prisma.menuRecipeItem.deleteMany({ where }),
      prisma.prepItem.deleteMany({ where }),              // cascades Recipe + its ingredient lines
      prisma.inventoryItem.deleteMany({ where: { id: { in: archived } } }),
    ]);
    void userId;
    return { deleted: archived, failed };
  } catch (e: any) {
    // Whole batch rolled back — report the archived set as failed with the cause.
    for (const id of archived) failed.push({ id, reasons: [e?.message || "delete error"] });
    return { deleted: [], failed };
  }
}

/**
 * Merge duplicate inventory items into one active target item. Safe:
 *  - Re-links recipe + menu ingredient lines from the duplicates to the target
 *    (handling unique-constraint collisions by keeping one line per recipe).
 *  - Archives the duplicates (soft delete). NEVER deletes counts/stock history.
 */
export async function mergeDuplicateItems(targetId: string, duplicateIds: string[], userId: string) {
  const dupes = duplicateIds.filter((id) => id !== targetId);
  if (dupes.length === 0) return { merged: 0 };

  await prisma.$transaction(async (tx) => {
    // ---- Recipe ingredient lines ----
    const dupRecipeLines = await tx.recipeIngredient.findMany({ where: { itemId: { in: dupes } }, select: { id: true, recipeId: true } });
    const targetRecipeIds = new Set(
      (await tx.recipeIngredient.findMany({ where: { itemId: targetId }, select: { recipeId: true } })).map((r) => r.recipeId)
    );
    const rDelete: string[] = [];
    const rUpdate: string[] = [];
    const seenRecipe = new Set<string>();
    for (const l of dupRecipeLines) {
      if (targetRecipeIds.has(l.recipeId) || seenRecipe.has(l.recipeId)) rDelete.push(l.id);
      else { rUpdate.push(l.id); seenRecipe.add(l.recipeId); }
    }
    if (rDelete.length) await tx.recipeIngredient.deleteMany({ where: { id: { in: rDelete } } });
    if (rUpdate.length) await tx.recipeIngredient.updateMany({ where: { id: { in: rUpdate } }, data: { itemId: targetId } });

    // ---- Menu recipe lines ----
    const dupMenuLines = await tx.menuRecipeItem.findMany({ where: { itemId: { in: dupes } }, select: { id: true, menuRecipeId: true } });
    const targetMenuIds = new Set(
      (await tx.menuRecipeItem.findMany({ where: { itemId: targetId }, select: { menuRecipeId: true } })).map((r) => r.menuRecipeId)
    );
    const mDelete: string[] = [];
    const mUpdate: string[] = [];
    const seenMenu = new Set<string>();
    for (const l of dupMenuLines) {
      if (targetMenuIds.has(l.menuRecipeId) || seenMenu.has(l.menuRecipeId)) mDelete.push(l.id);
      else { mUpdate.push(l.id); seenMenu.add(l.menuRecipeId); }
    }
    if (mDelete.length) await tx.menuRecipeItem.deleteMany({ where: { id: { in: mDelete } } });
    if (mUpdate.length) await tx.menuRecipeItem.updateMany({ where: { id: { in: mUpdate } }, data: { itemId: targetId } });

    // ---- Archive the duplicates (history stays attached to them) ----
    await tx.inventoryItem.updateMany({ where: { id: { in: dupes } }, data: { isActive: false, deletedAt: new Date(), deletedById: userId } });
  });

  return { merged: dupes.length };
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
