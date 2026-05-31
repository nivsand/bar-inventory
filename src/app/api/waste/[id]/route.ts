import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, notFound } from "@/lib/api";
import { applyAdjustment } from "@/server/stock";
import { logAudit } from "@/server/audit";

// Delete a waste entry. Manager/Admin only (requireManager enforces RBAC).
// Reverses the stock deduction the entry originally made so inventory stays
// correct, and records the deletion in the audit trail.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const entry = await prisma.wasteEntry.findUnique({ where: { id: params.id }, include: { item: true } });
    if (!entry) return notFound();

    await prisma.$transaction(async (tx) => {
      // Put back the quantity that was removed when the waste was reported.
      await applyAdjustment(tx, {
        itemId: entry.itemId,
        delta: Math.abs(entry.qty),
        source: "MANUAL",
        refType: "WasteEntryDeleted",
        refId: entry.id,
        userId: user.id,
        note: `Reversal of deleted waste (${entry.reason})`,
      });
      await tx.wasteEntry.delete({ where: { id: entry.id } });
    });

    await logAudit({
      userId: user.id,
      entity: "WasteEntry",
      entityId: entry.id,
      action: "DELETE",
      changes: {
        item: { old: entry.item.nameEn, new: null },
        qty: { old: entry.qty, new: null },
        reason: { old: entry.reason, new: null },
      },
    });

    return ok({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
