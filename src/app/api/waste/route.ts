import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";
import { applyAdjustment } from "@/server/stock";

export async function GET() {
  try {
    await requireUser();
    return ok(await prisma.wasteEntry.findMany({ include: { item: true, user: true }, orderBy: { createdAt: "desc" }, take: 200 }));
  } catch (e) { return serverError(e); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { itemId, qty, unit, reason, note } = await req.json();
    const entry = await prisma.$transaction(async (tx) => {
      const e = await tx.wasteEntry.create({ data: { itemId, qty, unit, reason, note: note ?? null, userId: user.id } });
      await applyAdjustment(tx, { itemId, delta: -Math.abs(qty), source: "WASTE", refType: "WasteEntry", refId: e.id, userId: user.id, note: reason });
      return e;
    });
    return created(entry);
  } catch (e) { return serverError(e); }
}
