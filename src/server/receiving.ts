import { prisma } from "@/lib/prisma";
import { applyBatchAdjustments } from "@/server/stock";
import { Prisma } from "@prisma/client";

/**
 * Receiving goods — the single source of truth for what actually arrived.
 *
 * Receiving lives inside the Order workflow: a manager opens an open order,
 * reviews/edits the received quantities (prefilled with the ordered quantity)
 * and finally moves the order to ARRIVED. Only THEN is stock applied, through
 * the existing inventory ledger (applyBatchAdjustments -> InventoryAdjustment).
 *
 * The record itself reuses the existing Delivery / DeliveryItem models, so all
 * existing consumers (reports, supplier performance, archive checks) keep
 * working unchanged. One active receiving record per order:
 *   DRAFT     — under review, no stock effect
 *   APPROVED  — quantities applied to inventory (confirmed = true), immutable
 */

export type ReceivingLineInput = {
  itemId: string;
  receivedQty: number;
  isMissing?: boolean;
  isShort?: boolean;
  note?: string | null;
};

export type ReceivingSaveInput = {
  lines: ReceivingLineInput[];
  notes?: string | null;
};

const receivingItemSelect = {
  id: true,
  itemId: true,
  orderedQty: true,
  receivedQty: true,
  unit: true,
  isMissing: true,
  isShort: true,
  note: true,
} as const;

/** The active (non-rejected) receiving record for an order, if one exists. */
export async function findOrderReceiving(
  client: Prisma.TransactionClient | typeof prisma,
  orderId: string
) {
  return client.delivery.findFirst({
    where: { orderId, status: { not: "REJECTED" } },
    orderBy: { createdAt: "desc" },
    include: { items: { select: receivingItemSelect } },
  });
}

function hasShortageOf(lines: { receivedQty: number; orderedQty?: number | null; isMissing?: boolean; isShort?: boolean }[]) {
  return lines.some((l) => l.isMissing || l.isShort || (l.orderedQty != null && l.receivedQty < l.orderedQty));
}

/**
 * Build the review table for an order: every ordered line, overlaid with any
 * quantities already reviewed. Ordered lines are the only lines that can be
 * received — products are added BEFORE the order is generated, never after.
 */
export async function getOrderReceivingView(orderId: string) {
  const [order, receiving] = await Promise.all([
    prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        supplierId: true,
        items: {
          select: {
            itemId: true,
            orderedQty: true,
            unit: true,
            item: { select: { nameHe: true, nameEn: true } },
          },
        },
      },
    }),
    findOrderReceiving(prisma, orderId),
  ]);

  const savedByItemId = new Map((receiving?.items ?? []).map((di) => [di.itemId, di]));
  const lines = order.items.map((oi) => {
    const saved = savedByItemId.get(oi.itemId);
    return {
      itemId: oi.itemId,
      nameHe: oi.item.nameHe,
      nameEn: oi.item.nameEn,
      unit: saved?.unit ?? oi.unit,
      orderedQty: oi.orderedQty,
      // Default: assume everything ordered arrived, until the manager says otherwise.
      receivedQty: saved?.receivedQty ?? oi.orderedQty,
      isMissing: saved?.isMissing ?? false,
      isShort: saved?.isShort ?? false,
      note: saved?.note ?? "",
    };
  });

  return {
    orderId: order.id,
    orderStatus: order.status,
    receivingId: receiving?.id ?? null,
    status: receiving?.status ?? null,
    confirmed: receiving?.confirmed ?? false,
    notes: receiving?.notes ?? null,
    reviewedAt: receiving?.receivedAt ?? null,
    lines,
  };
}

/**
 * Create/update the DRAFT receiving record for an order. Lines that don't
 * belong to the order are rejected (no products may be added after generation).
 * Never touches stock — that happens once, on ARRIVED.
 */
export async function saveOrderReceiving(orderId: string, userId: string, input: ReceivingSaveInput) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { id: true, supplierId: true, items: { select: { itemId: true, orderedQty: true, unit: true } } },
  });
  const orderLineByItemId = new Map(order.items.map((oi) => [oi.itemId, oi]));

  const unknown = input.lines.find((l) => !orderLineByItemId.has(l.itemId));
  if (unknown) throw new Error("Only products that are part of this order can be received");

  const existing = await findOrderReceiving(prisma, orderId);
  if (existing?.confirmed) throw new Error("This order has already been received — quantities can no longer be changed");

  const items = input.lines.map((l) => {
    const ordered = orderLineByItemId.get(l.itemId)!;
    const receivedQty = l.isMissing ? 0 : Math.max(0, Number(l.receivedQty) || 0);
    return {
      itemId: l.itemId,
      orderedQty: ordered.orderedQty,
      receivedQty,
      unit: ordered.unit,
      isMissing: !!l.isMissing || receivedQty === 0,
      isShort: !l.isMissing && receivedQty > 0 && receivedQty < ordered.orderedQty,
      note: l.note || null,
    };
  });
  const hasShortage = hasShortageOf(items);

  return prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.deliveryItem.deleteMany({ where: { deliveryId: existing.id } });
      return tx.delivery.update({
        where: { id: existing.id },
        data: {
          receivedById: userId,
          receivedAt: new Date(),
          hasShortage,
          notes: input.notes ?? existing.notes,
          items: { create: items },
        },
        include: { items: { select: receivingItemSelect } },
      });
    }
    return tx.delivery.create({
      data: {
        orderId,
        supplierId: order.supplierId,
        receivedById: userId,
        status: "DRAFT",
        confirmed: false,
        hasShortage,
        notes: input.notes ?? null,
        items: { create: items },
      },
      include: { items: { select: receivingItemSelect } },
    });
  });
}

/**
 * Apply the reviewed receiving to inventory. Called exactly once per order,
 * when its status becomes ARRIVED. If the manager never opened the receiving
 * screen, the order is received in full (received == ordered).
 *
 * Stock goes through the existing ledger helper, so InventoryAdjustment stays
 * the complete history (source DELIVERY, refType "Delivery").
 */
export async function applyOrderReceiving(
  tx: Prisma.TransactionClient,
  params: { orderId: string; userId: string }
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: params.orderId },
    select: { id: true, supplierId: true, items: { select: { itemId: true, orderedQty: true, unit: true } } },
  });

  let receiving = await tx.delivery.findFirst({
    where: { orderId: params.orderId, status: { not: "REJECTED" } },
    orderBy: { createdAt: "desc" },
    include: { items: { select: receivingItemSelect } },
  });

  if (!receiving) {
    receiving = await tx.delivery.create({
      data: {
        orderId: params.orderId,
        supplierId: order.supplierId,
        receivedById: params.userId,
        status: "DRAFT",
        confirmed: false,
        hasShortage: false,
        items: {
          create: order.items.map((oi) => ({
            itemId: oi.itemId,
            orderedQty: oi.orderedQty,
            receivedQty: oi.orderedQty,
            unit: oi.unit,
          })),
        },
      },
      include: { items: { select: receivingItemSelect } },
    });
  }

  // Idempotent: stock is applied once per receiving record.
  if (receiving.confirmed) return { receivingId: receiving.id, applied: false };

  await applyBatchAdjustments(
    tx,
    receiving.items
      .filter((di) => di.receivedQty > 0)
      .map((di) => ({
        itemId: di.itemId,
        delta: di.receivedQty,
        source: "DELIVERY" as const,
        refType: "Delivery",
        refId: receiving!.id,
        userId: params.userId,
      }))
  );

  await tx.delivery.update({
    where: { id: receiving.id },
    data: {
      status: "APPROVED",
      confirmed: true,
      hasShortage: hasShortageOf(receiving.items),
      approvedById: params.userId,
      approvedAt: new Date(),
    },
  });

  return { receivingId: receiving.id, applied: true };
}
