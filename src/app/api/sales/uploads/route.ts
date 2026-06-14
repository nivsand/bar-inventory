export const dynamic = "force-dynamic";
export const revalidate = 0;

import * as XLSX from "xlsx";
import { getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek } from "date-fns";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError, badRequest } from "@/lib/api";
import { parseTabularSales, normalizeProductName } from "@/lib/sales";
import { recomputeWeeklySales } from "@/server/sales";

export async function GET() {
  try {
    await requireManager();
    const uploads = await prisma.salesUpload.findMany({
      include: { uploadedBy: { select: { name: true } }, _count: { select: { lines: true } } },
      orderBy: [{ year: "desc" }, { weekNumber: "desc" }, { uploadedAt: "desc" }],
      take: 100,
    });
    return ok(uploads);
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const user = await requireManager();
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const pasteText = form.get("pasteText") as string | null;
    const periodStartStr = form.get("periodStart") as string | null;
    if (!periodStartStr) return badRequest("periodStart is required");

    let rawData: string;
    let source: "CSV" | "EXCEL" | "PASTE";
    let fileName: string | null = null;

    if (file && file.size > 0) {
      fileName = file.name;
      const buf = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rawData = XLSX.utils.sheet_to_csv(sheet);
      source = /\.xlsx?$/i.test(file.name) ? "EXCEL" : "CSV";
    } else if (pasteText && pasteText.trim()) {
      rawData = pasteText;
      source = "PASTE";
    } else {
      return badRequest("Provide a file or pasted data");
    }

    const rows = parseTabularSales(rawData);
    if (rows.length === 0) return badRequest("Could not find product name / quantity columns in the data");

    const anchor = new Date(periodStartStr);
    if (Number.isNaN(anchor.getTime())) return badRequest("Invalid periodStart");
    const periodStart = startOfISOWeek(anchor);
    const periodEnd = endOfISOWeek(anchor);
    const weekNumber = getISOWeek(anchor);
    const year = getISOWeekYear(anchor);

    // Auto-map against saved POS-name -> item mappings.
    const mappings = await prisma.productMapping.findMany();
    const mapByName = new Map(mappings.map((m) => [m.posProductName, m.itemId]));

    const upload = await prisma.salesUpload.create({
      data: {
        source, fileName, rawData, periodStart, periodEnd, weekNumber, year,
        uploadedById: user.id,
        lines: {
          create: rows.map((r) => ({
            posProductName: r.posProductName,
            quantitySold: r.quantitySold,
            revenue: r.revenue,
            mappedItemId: mapByName.get(normalizeProductName(r.posProductName)) ?? null,
          })),
        },
      },
    });

    await recomputeWeeklySales(upload.id);

    const result = await prisma.salesUpload.findUnique({
      where: { id: upload.id },
      include: { uploadedBy: { select: { name: true } }, _count: { select: { lines: true } } },
    });
    return created(result);
  } catch (e) { return serverError(e); }
}
