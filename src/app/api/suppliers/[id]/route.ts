import { withRouteTiming } from "@/lib/perf";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badRequest, ok, serverError } from "@/lib/api";
import { logAudit, diff } from "@/server/audit";
import { deleteOrArchiveSupplier } from "@/server/archive";
import { z } from "zod";

const patchSchema = z.object({
  nameHe: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  contactPerson: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  orderingMethod: z.enum(["WHATSAPP", "EMAIL", "PHONE", "APP", "OTHER"]).optional(),
  orderDeadlineDays: z.array(z.number()).optional(),
  orderCutoffTime: z.string().nullable().optional(),
  deliveryDays: z.array(z.number()).optional(),
  leadTimeDays: z.coerce.number().optional(),
  minOrderAmount: z.coerce.number().min(0).nullable().optional(),
  minOrderNote: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
}).strip();

async function PATCH__handler(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    const body: any = { ...parsed.data };
    if (body.isActive === true) { body.deletedAt = null; body.deletedById = null; }
    const before = await prisma.supplier.findUniqueOrThrow({ where: { id: params.id } });
    const s = await prisma.supplier.update({ where: { id: params.id }, data: body });
    await logAudit({ userId: user.id, entity: "Supplier", entityId: s.id, action: "UPDATE", changes: diff(before, body) });
    return ok(s);
  } catch (e) { return serverError(e); }
}
// Delete a supplier. Manager/Admin only. Hard-deletes only when it has no items
// or orders; otherwise soft-archives it.
async function DELETE__handler(_req: Request, { params }: { params: { id: string } }) {
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

// --- dev-only request timing (see src/lib/perf.ts) ---
export const PATCH = withRouteTiming("PATCH", "/api/suppliers/[id]", PATCH__handler);
export const DELETE = withRouteTiming("DELETE", "/api/suppliers/[id]", DELETE__handler);
