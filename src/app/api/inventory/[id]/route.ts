import { requireManager, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { logAudit, diff } from "@/server/audit";
import { deleteOrArchiveItem } from "@/server/archive";
import { z } from "zod";

// Whitelist of updatable fields. This is the fix for the edit-save bug: the
// client sends the whole item object (including the included `category` and
// `supplier` relation objects, plus id/createdAt/updatedAt), and passing that
// straight to prisma.update() makes Prisma throw on the unknown relation args.
// Parsing through this schema strips everything that isn't an updatable column.
const patchSchema = z.object({
  nameHe: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  kind: z.enum(["RAW", "PREP"]).optional(),
  area: z.enum(["KITCHEN", "FLOOR"]).optional(),
  inCount: z.boolean().optional(),
  categoryId: z.string().nullable().optional(),
  supplierId: z.string().nullable().optional(),
  currentQty: z.coerce.number().optional(),
  minQty: z.coerce.number().optional(),
  parQty: z.coerce.number().optional(),
  avgDailyUsage: z.coerce.number().optional(),
  packSize: z.coerce.number().nullable().optional(),
  orderMultiple: z.coerce.number().nullable().optional(),
  shelfLifeDays: z.coerce.number().nullable().optional(),
  orderUnitNameHe: z.string().nullable().optional(),
  orderUnitNameEn: z.string().nullable().optional(),
  unitsPerOrderUnit: z.coerce.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(), // used by archive restore
}).strip();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    const data: any = { ...parsed.data };
    // Restoring an archived item clears the archive markers.
    if (data.isActive === true) { data.deletedAt = null; data.deletedById = null; }

    const before = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: params.id } });
    const item = await prisma.inventoryItem.update({ where: { id: params.id }, data });
    await logAudit({ userId: user.id, entity: "InventoryItem", entityId: item.id, action: "UPDATE", changes: diff(before, data) });
    return ok(item);
  } catch (e) { return serverError(e); }
}

// DELETE behaviour:
//  - default: Manager/Admin archive-or-delete (hard delete only if no history).
//  - ?hard=1: ADMIN-only PERMANENT delete. If the item is referenced by other
//    records, return a clear 400 instead of crashing with a raw FK error.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const hard = new URL(req.url).searchParams.get("hard") === "1";

    if (hard) {
      const user = await requireAdmin();
      try {
        await prisma.inventoryItem.delete({ where: { id: params.id } });
      } catch (e: any) {
        if (e?.code === "P2003" || e?.code === "P2014") {
          return badRequest("Cannot permanently delete: this item is still referenced by counts, orders, deliveries, waste, recipes or adjustments. It remains archived.");
        }
        throw e;
      }
      await logAudit({ userId: user.id, entity: "InventoryItem", entityId: params.id, action: "DELETE", changes: { state: { old: "archived", new: "purged" } } });
      return ok({ ok: true, result: "deleted" });
    }

    const user = await requireManager();
    const result = await deleteOrArchiveItem(params.id, user.id);
    await logAudit({
      userId: user.id, entity: "InventoryItem", entityId: params.id, action: "DELETE",
      changes: { state: { old: "active", new: result } },
    });
    return ok({ ok: true, result });
  } catch (e) { return serverError(e); }
}
