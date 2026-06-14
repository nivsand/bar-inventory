import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

export async function GET() {
  try {
    await requireManager();
    const mappings = await prisma.productMapping.findMany({
      include: { item: { select: { nameHe: true, nameEn: true } } },
      orderBy: { posProductName: "asc" },
    });
    return ok(mappings);
  } catch (e) { return serverError(e); }
}
