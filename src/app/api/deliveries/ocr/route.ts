import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { getOcrProvider, matchItem } from "@/server/ocr";

// OCR extraction only — returns extracted items for an editable review table.
// Available to any authenticated user; it never writes to inventory.
export async function POST(req: Request) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return badRequest("file required");
    const buffer = Buffer.from(await file.arrayBuffer());

    const provider = getOcrProvider();
    const extracted = await provider.extract({ buffer, mimeType: file.type, filename: file.name });

    // Suggest item matches for review (manager must approve before stock changes).
    const items = await prisma.inventoryItem.findMany({ where: { isActive: true }, select: { id: true, nameHe: true, nameEn: true, unit: true } });
    const reviewItems = extracted.items.map((ei) => {
      const matchedId = matchItem(ei.rawName, items);
      const matched = items.find((i) => i.id === matchedId) || null;
      return { ...ei, matchedItemId: matchedId, matchedItem: matched };
    });

    return ok({ provider: provider.name, extracted: { ...extracted, items: reviewItems } });
  } catch (e) { return serverError(e); }
}
