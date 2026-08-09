import { withRouteTiming } from "@/lib/perf";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

async function DELETE__handler(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireManager();
    await prisma.productMapping.delete({ where: { id: params.id } });
    return ok({ ok: true });
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const DELETE = withRouteTiming("DELETE", "/api/sales/mappings/[id]", DELETE__handler);
