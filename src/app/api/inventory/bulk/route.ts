import { requireManager, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { deleteOrArchiveItem, bulkHardDelete } from "@/server/archive";
import { logAudit } from "@/server/audit";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["archive", "restore", "category", "permanentDelete"]),
  ids: z.array(z.string().min(1)).min(1),
  categoryId: z.string().nullable().optional(),
});

// Bulk inventory operations.
//  - permanentDelete: ADMIN only. Tries to hard-delete each item; returns a
//    summary of deleted vs failed (with item name + reason). Never crashes.
//  - archive / restore / category: Manager/Admin.
export async function POST(req: Request) {
  try {
    const { action, ids, categoryId } = schema.parse(await req.json());

    if (action === "permanentDelete") {
      const user = await requireAdmin();
      // Names for the result summary.
      const items = await prisma.inventoryItem.findMany({ where: { id: { in: ids } }, select: { id: true, nameHe: true, nameEn: true } });
      const byId = new Map(items.map((i) => [i.id, i]));

      const { deleted, failed } = await bulkHardDelete(ids); // batched: ~2 round trips total

      const failedDetailed = failed.map((f) => {
        const it = byId.get(f.id);
        return { id: f.id, nameHe: it?.nameHe ?? f.id, nameEn: it?.nameEn ?? f.id, reason: f.reasons.join(", ") };
      });

      await logAudit({ userId: user.id, entity: "InventoryItem", entityId: ids.join(","), action: "DELETE", changes: { bulkPurge: { old: null, new: `${deleted.length} deleted, ${failed.length} kept` } } });
      return ok({ deletedCount: deleted.length, failedCount: failed.length, failed: failedDetailed });
    }

    const user = await requireManager();
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
