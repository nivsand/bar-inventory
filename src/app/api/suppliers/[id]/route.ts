import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { logAudit, diff } from "@/server/audit";
import { deleteOrArchiveSupplier } from "@/server/archive";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const body = await req.json();
    const before = await prisma.supplier.findUniqueOrThrow({ where: { id: params.id } });
    const s = await prisma.supplier.update({ where: { id: params.id }, data: body });
    await logAudit({ userId: user.id, entity: "Supplier", entityId: s.id, action: "UPDATE", changes: diff(before, body) });
    return ok(s);
  } catch (e) { return serverError(e); }
}
// Delete a supplier. Manager/Admin only. Hard-deletes only when it has no items
// or orders; otherwise soft-archives it.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const result = await deleteOrArchiveSupplier(params.id, user.id);
    await logAudit({
      userId: user.id, entity: "Supplier", entityId: params.id, action: "DELETE",
      changes: { state: { old: "active", new: result } },
    });
    return ok({ ok: true, result });
  } catch (e) { return serverError(e); }
}
