import { prisma } from "@/lib/prisma";

/**
 * Recompute the (item, ISO week) aggregates for every mapped product in an
 * upload, summed across ALL uploads for that same week (re-uploads /
 * corrections for an already-reported week are folded together). Also
 * updates the upload's status: PROCESSED once every line has a mapping,
 * otherwise PENDING_MAPPING.
 */
export async function recomputeWeeklySales(uploadId: string) {
  const upload = await prisma.salesUpload.findUniqueOrThrow({ where: { id: uploadId } });
  const mappedLines = await prisma.salesLine.findMany({ where: { uploadId, mappedItemId: { not: null } } });
  const itemIds = [...new Set(mappedLines.map((l) => l.mappedItemId as string))];

  for (const itemId of itemIds) {
    const all = await prisma.salesLine.findMany({
      where: { mappedItemId: itemId, upload: { year: upload.year, weekNumber: upload.weekNumber } },
    });
    const quantitySold = Math.round(all.reduce((s, l) => s + l.quantitySold, 0) * 1000) / 1000;
    const revenues = all.filter((l) => l.revenue != null).map((l) => l.revenue as number);
    const revenue = revenues.length ? Math.round(revenues.reduce((s, r) => s + r, 0) * 100) / 100 : null;
    await prisma.weeklySales.upsert({
      where: { itemId_year_weekNumber: { itemId, year: upload.year, weekNumber: upload.weekNumber } },
      update: { quantitySold, revenue },
      create: { itemId, year: upload.year, weekNumber: upload.weekNumber, quantitySold, revenue },
    });
  }

  const unmapped = await prisma.salesLine.count({ where: { uploadId, mappedItemId: null } });
  await prisma.salesUpload.update({
    where: { id: uploadId },
    data: { status: unmapped > 0 ? "PENDING_MAPPING" : "PROCESSED" },
  });
}
