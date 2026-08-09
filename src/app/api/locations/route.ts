import { withRouteTiming } from "@/lib/perf";
import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";

async function GET__handler() {
  try { await requireUser(); return ok(await prisma.location.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })); }
  catch (e) { return serverError(e); }
}

async function POST__handler(req: Request) {
  try {
    await requireManager();
    const { nameHe, nameEn, sortOrder } = await req.json();
    return created(await prisma.location.create({ data: { nameHe, nameEn, sortOrder: sortOrder ?? 0 } }));
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const GET = withRouteTiming("GET", "/api/locations", GET__handler);
export const POST = withRouteTiming("POST", "/api/locations", POST__handler);
