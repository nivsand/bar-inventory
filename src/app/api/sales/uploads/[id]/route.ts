import { withRouteTiming } from "@/lib/perf";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, notFound } from "@/lib/api";

async function GET__handler(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireManager();
    const upload = await prisma.salesUpload.findUnique({
      where: { id: params.id },
      include: {
        uploadedBy: { select: { name: true } },
        lines: { include: { mappedItem: { select: { nameHe: true, nameEn: true } } }, orderBy: { posProductName: "asc" } },
      },
    });
    if (!upload) return notFound();
    return ok(upload);
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const GET = withRouteTiming("GET", "/api/sales/uploads/[id]", GET__handler);
