export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { suggestMatches } from "@/lib/sales";

// Unmapped sales lines plus best-guess inventory item suggestions, for the
// manual product-mapping screen.
export async function GET() {
  try {
    await requireManager();
    const lines = await prisma.salesLine.findMany({
      where: { mappedItemId: null },
      include: { upload: { select: { year: true, weekNumber: true, fileName: true, source: true, uploadedAt: true } } },
      orderBy: { upload: { uploadedAt: "desc" } },
      take: 200,
    });
    const items = await prisma.inventoryItem.findMany({ where: { isActive: true }, select: { id: true, nameHe: true, nameEn: true } });
    const out = lines.map((l) => ({ ...l, suggestions: suggestMatches(l.posProductName, items) }));
    return ok(out);
  } catch (e) { return serverError(e); }
}
