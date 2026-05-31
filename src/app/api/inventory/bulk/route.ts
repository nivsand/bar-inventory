import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { deleteOrArchiveItem } from "@/server/archive";
import { logAudit } from "@/server/audit";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["archive", "restore", "category"]),
  ids: z.array(z.string().min(1)).min(1),
  categoryId: z.string().nullable().optional(),
});

// Bulk inventory operations. Manager/Admin only.
export async function POST(req: Request) {
  try {
    const user = await requireManager();
    const { action, ids, categoryId } = schema.parse(await req.json());

    if (action === "archive") {
      for (const id of ids) await deleteOrArchiveItem(id, user.id);
    } else if (action === "restore") {
      await prisma.inventoryItem.updateMany({ where: { id: { in: ids } }, data: { isActive: true, deletedAt: null, deletedById: null } });
    } else if (action === "category") {
      await prisma.inventoryItem.updateMany({ where: { id: { in: ids } }, data: { categoryId: categoryId || null } });
    }

    await logAudit({ userId: user.id, entity: "InventoryItem", entityId: ids.join(","), action: "UPDATE", changes: { bulk: { old: null, new: action } } });
    return ok({ ok: true, count: ids.length });
  } catch (e: any) {
    if (e?.name === "ZodError") return badRequest("Invalid bulk request");
    return serverError(e);
  }
}
