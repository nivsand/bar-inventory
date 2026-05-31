import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { logAudit } from "@/server/audit";

// Edit a prep task. Manager/Admin only.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const body = await req.json(); // { targetQty?, assigneeId?, dueDate?, status?, reason? }
    const data: any = {};
    if (body.targetQty !== undefined) data.targetQty = Number(body.targetQty);
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.status !== undefined) data.status = body.status;
    if (body.reason !== undefined) data.reason = body.reason;
    const task = await prisma.prepTask.update({ where: { id: params.id }, data });
    await logAudit({ userId: user.id, entity: "PrepTask", entityId: params.id, action: "UPDATE" });
    return ok(task);
  } catch (e) {
    return serverError(e);
  }
}

// Delete a prep task. Manager/Admin only.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    await prisma.prepTask.delete({ where: { id: params.id } });
    await logAudit({ userId: user.id, entity: "PrepTask", entityId: params.id, action: "DELETE" });
    return ok({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
