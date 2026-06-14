import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { normalizeProductName } from "@/lib/sales";
import { recomputeWeeklySales } from "@/server/sales";

// Map a single uploaded sales line to an inventory item, and save the
// POS-name -> item mapping so future uploads auto-map.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireManager();
    const { itemId } = await req.json();
    if (!itemId) return badRequest("itemId is required");

    const line = await prisma.salesLine.update({ where: { id: params.id }, data: { mappedItemId: itemId } });

    const posProductName = normalizeProductName(line.posProductName);
    await prisma.productMapping.upsert({
      where: { posProductName },
      update: { itemId },
      create: { posProductName, itemId },
    });

    await recomputeWeeklySales(line.uploadId);
    return ok({ ok: true });
  } catch (e) { return serverError(e); }
}
