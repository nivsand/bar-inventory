import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { mergeDuplicateItems } from "@/server/archive";
import { logAudit } from "@/server/audit";
import { z } from "zod";

const schema = z.object({
  targetId: z.string().min(1),
  duplicateIds: z.array(z.string().min(1)).min(1),
});

// Admin-only "force cleanup duplicates": re-link recipe/menu lines from the
// duplicate items to the chosen target, then archive the duplicates. History is
// never deleted.
export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const { targetId, duplicateIds } = schema.parse(await req.json());
    if (duplicateIds.includes(targetId)) return badRequest("Target cannot also be a duplicate");

    const target = await prisma.inventoryItem.findUnique({ where: { id: targetId }, select: { id: true, isActive: true } });
    if (!target || !target.isActive) return badRequest("Target item must be an active inventory item");

    const result = await mergeDuplicateItems(targetId, duplicateIds, user.id);
    await logAudit({ userId: user.id, entity: "InventoryItem", entityId: targetId, action: "UPDATE", changes: { merged: { old: null, new: `${result.merged} duplicates -> ${targetId}` } } });
    return ok(result);
  } catch (e: any) {
    if (e?.name === "ZodError") return badRequest("Invalid merge request");
    return serverError(e);
  }
}
