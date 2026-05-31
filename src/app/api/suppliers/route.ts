import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { z } from "zod";

export async function GET(req: Request) {
  try {
    await requireUser();
    const archived = new URL(req.url).searchParams.get("archived") === "1";
    if (archived) {
      // Archived suppliers are manager/admin-only and excluded from normal lists.
      await requireManager();
      return ok(await prisma.supplier.findMany({ where: { isActive: false }, orderBy: { deletedAt: "desc" } }));
    }
    return ok(await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { nameEn: "asc" } }));
  } catch (e) { return serverError(e); }
}

const schema = z.object({
  nameHe: z.string().min(1), nameEn: z.string().min(1),
  contactPerson: z.string().nullable().optional(), phone: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(), email: z.string().nullable().optional(),
  orderingMethod: z.enum(["WHATSAPP", "EMAIL", "PHONE", "APP", "OTHER"]).default("WHATSAPP"),
  orderDeadlineDays: z.array(z.number()).default([]), orderCutoffTime: z.string().nullable().optional(),
  deliveryDays: z.array(z.number()).default([]), leadTimeDays: z.number().default(1),
  minOrderAmount: z.number().nullable().optional(), minOrderNote: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireManager();
    const data = schema.parse(await req.json());
    const s = await prisma.supplier.create({ data });
    await logAudit({ userId: user.id, entity: "Supplier", entityId: s.id, action: "CREATE" });
    return created(s);
  } catch (e) { return serverError(e); }
}
