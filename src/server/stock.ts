import { prisma } from "@/lib/prisma";
import { AdjustmentSource, Prisma } from "@prisma/client";

/**
 * Apply a stock change through the ledger. Every mutation to currentQty goes
 * through here so InventoryAdjustment is a complete, auditable history.
 */
export async function applyAdjustment(
  tx: Prisma.TransactionClient,
  params: { itemId: string; delta: number; source: AdjustmentSource; refType?: string; refId?: string; userId?: string; note?: string }
) {
  const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: params.itemId } });
  const resultQty = Math.round((item.currentQty + params.delta) * 1000) / 1000;
  await tx.inventoryItem.update({ where: { id: params.itemId }, data: { currentQty: resultQty } });
  await tx.inventoryAdjustment.create({
    data: {
      itemId: params.itemId, delta: params.delta, resultQty, source: params.source,
      refType: params.refType, refId: params.refId, userId: params.userId, note: params.note,
    },
  });
  return resultQty;
}

/**
 * Set an item's stock to an absolute value (used by daily count — the source of truth).
 * Records the difference as a DAILY_COUNT adjustment.
 */
export async function setAbsoluteStock(
  tx: Prisma.TransactionClient,
  params: { itemId: string; countedQty: number; source: AdjustmentSource; refType?: string; refId?: string; userId?: string; note?: string }
) {
  const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: params.itemId } });
  const delta = Math.round((params.countedQty - item.currentQty) * 1000) / 1000;
  await tx.inventoryItem.update({ where: { id: params.itemId }, data: { currentQty: params.countedQty } });
  await tx.inventoryAdjustment.create({
    data: {
      itemId: params.itemId, delta, resultQty: params.countedQty, source: params.source,
      refType: params.refType, refId: params.refId, userId: params.userId, note: params.note,
    },
  });
  return params.countedQty;
}
