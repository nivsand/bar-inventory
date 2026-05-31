import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { logAudit, diff } from "@/server/audit";
import { deleteOrArchiveItem } from "@/server/archive";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const body = await req.json();
    const before = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: params.id } });
    const item = await prisma.inventoryItem.update({ where: { id: params.id }, data: body });
    await logAudit({ userId: user.id, entity: "InventoryItem", entityId: item.id, action: "UPDATE", changes: diff(before, body) });
    return ok(item);
  } catch (e) { return serverError(e); }
}

// Delete an item. Manager/Admin only (employees are blocked by requireManager).
// Hard-deletes only when the item has no history; otherwise soft-archives it.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const result = await deleteOrArchiveItem(params.id, user.id);
    await logAudit({
      userId: user.id, entity: "InventoryItem", entityId: params.id, action: "DELETE",
      changes: { state: { old: "active", new: result } },
    });
    return ok({ ok: true, result });
  } catch (e) { return serverError(e); }
}
