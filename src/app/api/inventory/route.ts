import { withRouteTiming } from "@/lib/perf";
// Always render fresh from the DB — never serve cached/stale data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { inventoryCreateSchema } from "@/server/validation";

const orderPickerSelect = {
  id: true,
  nameHe: true,
  nameEn: true,
  supplierId: true,
} as const;

async function GET__handler(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind") || undefined;
    const area = searchParams.get("area") || undefined;       // KITCHEN | FLOOR
    const locationId = searchParams.get("locationId") || undefined; // physical storage/count location
    const inCount = searchParams.get("inCount") === "1";        // only count-enabled items
    const archived = searchParams.get("archived") === "1";
    const mode = searchParams.get("mode") || undefined;

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

    if (mode === "order-picker") {
      const items = await prisma.inventoryItem.findMany({
        where: { isActive: true, ...(kind ? { kind: kind as any } : {}) },
        select: orderPickerSelect,
        orderBy: [{ nameEn: "asc" }],
      });
      return ok(items);
    }

    const items = await prisma.inventoryItem.findMany({
      where: {
        isActive: true,
        ...(kind ? { kind: kind as any } : {}),
        ...(area ? { area: area as any } : {}),
        ...(locationId ? { locationId } : {}),
        ...(inCount ? { inCount: true } : {}),
      },
      include: { category: true, supplier: true, location: true },
      orderBy: [{ area: "asc" }, { kind: "asc" }, { nameEn: "asc" }],
    });
    return ok(items);
  } catch (e) { return serverError(e); }
}

async function POST__handler(req: Request) {
  try {
    const user = await requireManager();
    const data = inventoryCreateSchema.parse(await req.json());
    const item = await prisma.inventoryItem.create({ data });
    await logAudit({ userId: user.id, entity: "InventoryItem", entityId: item.id, action: "CREATE" });
    return created(item);
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const GET = withRouteTiming("GET", "/api/inventory", GET__handler);
export const POST = withRouteTiming("POST", "/api/inventory", POST__handler);
