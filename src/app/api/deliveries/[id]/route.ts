import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, notFound } from "@/lib/api";
import { logAudit } from "@/server/audit";

// Delete a received-goods report from history. Admin only.
// DeliveryItems are cascade-deleted; the stock ledger (InventoryAdjustment) is
// left intact, so approving's effect on inventory is preserved as history.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAdmin();
    const d = await prisma.delivery.findUnique({ where: { id: params.id } });
    if (!d) return notFound();
    await prisma.delivery.delete({ where: { id: params.id } });
    await logAudit({ userId: user.id, entity: "Delivery", entityId: params.id, action: "DELETE" });
    return ok({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
