import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { setBatchAbsoluteStock } from "@/server/stock";
import { logAudit } from "@/server/audit";
import { z } from "zod";

const schema = z.object({
  supplierId: z.string().min(1),
  items: z.array(z.object({
    itemId: z.string().min(1),
    newQty: z.coerce.number().min(0),
    note: z.string().optional(),
  })).min(1),
});

export async function POST(req: Request) {
  try {
    const user = await requireManager();
    const { supplierId, items } = schema.parse(await req.json());

    const dbItems = await prisma.inventoryItem.findMany({
      where: { id: { in: items.map((i) => i.itemId) }, supplierId, isActive: true },
      select: { id: true },
    });
    const validIds = new Set(dbItems.map((i) => i.id));
    const invalid = items.filter((i) => !validIds.has(i.itemId));
    if (invalid.length > 0) return badRequest("Some items do not belong to this supplier");

    await prisma.$transaction(async (tx) => {
      await setBatchAbsoluteStock(tx, items.map((i) => ({
        itemId: i.itemId,
        countedQty: i.newQty,
        source: "MANUAL",
        refType: "QuickUpdate",
        userId: user.id,
        note: i.note || "Quick stock update",
      })));
    });

    await logAudit({
      userId: user.id, entity: "InventoryItem",
      entityId: items.map((i) => i.itemId).join(","), action: "UPDATE",
      changes: { quickUpdate: { old: null, new: `${items.length} items updated` } },
    });

    return ok({ ok: true, count: items.length });
  } catch (e: any) {
    if (e?.name === "ZodError") return badRequest("Invalid request");
    return serverError(e);
  }
}
