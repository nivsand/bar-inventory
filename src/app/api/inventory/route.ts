import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { z } from "zod";

export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind") || undefined;
    const archived = searchParams.get("archived") === "1";

    // Archived (soft-deleted) items are manager/admin-only and never appear in
    // the normal active list or count forms.
    if (archived) {
      await requireManager();
      const items = await prisma.inventoryItem.findMany({
        where: { isActive: false, ...(kind ? { kind: kind as any } : {}) },
        include: { category: true, supplier: true },
        orderBy: [{ deletedAt: "desc" }],
      });
      return ok(items);
    }

    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true, ...(kind ? { kind: kind as any } : {}) },
      include: { category: true, supplier: true },
      orderBy: [{ kind: "asc" }, { nameEn: "asc" }],
    });
    return ok(items);
  } catch (e) { return serverError(e); }
}

const schema = z.object({
  nameHe: z.string().min(1), nameEn: z.string().min(1), unit: z.string().min(1),
  kind: z.enum(["RAW", "PREP"]).default("RAW"),
  categoryId: z.string().nullable().optional(), supplierId: z.string().nullable().optional(),
  currentQty: z.number().default(0), minQty: z.number().default(0), parQty: z.number().default(0),
  avgDailyUsage: z.number().default(0), packSize: z.number().nullable().optional(),
  orderMultiple: z.number().nullable().optional(), shelfLifeDays: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireManager();
    const data = schema.parse(await req.json());
    const item = await prisma.inventoryItem.create({ data });
    await logAudit({ userId: user.id, entity: "InventoryItem", entityId: item.id, action: "CREATE" });
    return created(item);
  } catch (e) { return serverError(e); }
}
