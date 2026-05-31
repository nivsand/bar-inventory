import { requireUser, requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";

export async function GET() {
  try { await requireUser(); return ok(await prisma.category.findMany({ orderBy: { sortOrder: "asc" } })); }
  catch (e) { return serverError(e); }
}
export async function POST(req: Request) {
  try {
    await requireManager();
    const { nameHe, nameEn, kind, sortOrder } = await req.json();
    return created(await prisma.category.create({ data: { nameHe, nameEn, kind: kind ?? "RAW", sortOrder: sortOrder ?? 0 } }));
  } catch (e) { return serverError(e); }
}
