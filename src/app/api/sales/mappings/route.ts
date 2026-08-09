import { withRouteTiming } from "@/lib/perf";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

async function GET__handler() {
  try {
    await requireManager();
    const mappings = await prisma.productMapping.findMany({
      include: { item: { select: { nameHe: true, nameEn: true } } },
      orderBy: { posProductName: "asc" },
    });
    return ok(mappings);
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const GET = withRouteTiming("GET", "/api/sales/mappings", GET__handler);
