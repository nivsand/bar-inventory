import { withRouteTiming } from "@/lib/perf";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireManager } from "@/lib/auth";
import { badRequest, ok, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/server/audit";
import { z } from "zod";

const schema = z.object({ supplierId: z.string().min(1) });

function recommendationDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function POST__handler(req: Request) {
  try {
    const user = await requireManager();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Supplier is required");

    const supplier = await prisma.supplier.findFirst({ where: { id: parsed.data.supplierId, isActive: true } });
    if (!supplier) return badRequest("Supplier not found");

    const date = recommendationDate();
    const dismissal = await prisma.orderRecommendationDismissal.upsert({
      where: { supplierId_recommendationDate: { supplierId: supplier.id, recommendationDate: date } },
      update: {},
      create: { supplierId: supplier.id, recommendationDate: date, createdById: user.id },
    });

    await logAudit({
      userId: user.id,
      entity: "OrderRecommendationDismissal",
      entityId: dismissal.id,
      action: "CREATE",
      changes: {
        supplierId: { old: null, new: supplier.id },
        recommendationDate: { old: null, new: date.toISOString() },
      },
    });
    return ok({ ok: true });
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const POST = withRouteTiming("POST", "/api/orders/suggestions/not-today", POST__handler);
