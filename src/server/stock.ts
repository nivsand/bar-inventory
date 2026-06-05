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

type AdjustmentInput = {
  itemId: string;
  delta: number;
  source: AdjustmentSource;
  refType?: string;
  refId?: string;
  userId?: string;
  note?: string;
};

/**
 * Batch version of applyAdjustment.
 * 1 findMany + N updates + 1 createMany instead of 3N round trips.
 * Handles multiple adjustments to the same item correctly (running total).
 */
export async function applyBatchAdjustments(
  tx: Prisma.TransactionClient,
  adjustments: AdjustmentInput[]
) {
  if (adjustments.length === 0) return;

  const itemIds = [...new Set(adjustments.map((a) => a.itemId))];
  const items = await tx.inventoryItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, currentQty: true },
  });
  const qtyById = new Map(items.map((i) => [i.id, i.currentQty]));

  // Compute result quantities in order, tracking running totals per item.
  const results = adjustments.map((adj) => {
    const current = qtyById.get(adj.itemId) ?? 0;
    const resultQty = Math.round((current + adj.delta) * 1000) / 1000;
    qtyById.set(adj.itemId, resultQty);
    return { ...adj, resultQty };
  });

  // Update each item's stock (N updates, zero per-item reads).
  for (const r of results) {
    await tx.inventoryItem.update({ where: { id: r.itemId }, data: { currentQty: r.resultQty } });
  }

  // Single bulk insert for all ledger rows.
  await tx.inventoryAdjustment.createMany({
    data: results.map((r) => ({
      itemId: r.itemId,
      delta: r.delta,
      resultQty: r.resultQty,
      source: r.source,
      refType: r.refType,
      refId: r.refId,
      userId: r.userId,
      note: r.note,
    })),
  });
}

type AbsoluteStockInput = {
  itemId: string;
  countedQty: number;
  source: AdjustmentSource;
  refType?: string;
  refId?: string;
  userId?: string;
  note?: string;
};

/**
 * Batch version of setAbsoluteStock.
 * 1 findMany + N updates + 1 createMany instead of 3N round trips.
 */
export async function setBatchAbsoluteStock(
  tx: Prisma.TransactionClient,
  adjustments: AbsoluteStockInput[]
) {
  if (adjustments.length === 0) return;

  const itemIds = [...new Set(adjustments.map((a) => a.itemId))];
  const items = await tx.inventoryItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, currentQty: true },
  });
  const currentById = new Map(items.map((i) => [i.id, i.currentQty]));

  const results = adjustments.map((adj) => {
    const current = currentById.get(adj.itemId) ?? 0;
    const delta = Math.round((adj.countedQty - current) * 1000) / 1000;
    return { ...adj, delta, resultQty: adj.countedQty };
  });

  for (const r of results) {
    await tx.inventoryItem.update({ where: { id: r.itemId }, data: { currentQty: r.resultQty } });
  }

  await tx.inventoryAdjustment.createMany({
    data: results.map((r) => ({
      itemId: r.itemId,
      delta: r.delta,
      resultQty: r.resultQty,
      source: r.source,
      refType: r.refType,
      refId: r.refId,
      userId: r.userId,
      note: r.note,
    })),
  });
}
