import { withRouteTiming } from "@/lib/perf";
import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";

async function GET__handler() {
  try { await requireUser(); return ok(await prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })); }
  catch (e) { return serverError(e); }
}
async function POST__handler(req: Request) {
  try {
    await requireManager();
    const { nameHe, nameEn, kind, sortOrder } = await req.json();
    return created(await prisma.category.create({ data: { nameHe, nameEn, kind: kind ?? "RAW", sortOrder: sortOrder ?? 0 } }));
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const GET = withRouteTiming("GET", "/api/categories", GET__handler);
export const POST = withRouteTiming("POST", "/api/categories", POST__handler);
