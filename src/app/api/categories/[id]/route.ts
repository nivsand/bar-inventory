import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { z } from "zod";

const patchSchema = z.object({
  nameHe: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  kind: z.enum(["RAW", "PREP"]).optional(),
  sortOrder: z.coerce.number().optional(),
  isActive: z.boolean().optional(),
}).strip();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const data = patchSchema.parse(await req.json());
    const c = await prisma.category.update({ where: { id: params.id }, data });
    await logAudit({ userId: user.id, entity: "Category", entityId: c.id, action: "UPDATE" });
    return ok(c);
  } catch (e) { return serverError(e); }
}

// Archive a category if it still has items; otherwise hard-delete it.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const itemCount = await prisma.inventoryItem.count({ where: { categoryId: params.id } });
    let result: "deleted" | "archived";
    if (itemCount > 0) {
      await prisma.category.update({ where: { id: params.id }, data: { isActive: false } });
      result = "archived";
    } else {
      try {
        await prisma.category.delete({ where: { id: params.id } });
        result = "deleted";
      } catch (e: any) {
        if (e?.code === "P2003" || e?.code === "P2014") {
          await prisma.category.update({ where: { id: params.id }, data: { isActive: false } });
          result = "archived";
        } else throw e;
      }
    }
    await logAudit({ userId: user.id, entity: "Category", entityId: params.id, action: "DELETE", changes: { state: { old: "active", new: result } } });
    return ok({ ok: true, result });
  } catch (e) { return serverError(e); }
}
