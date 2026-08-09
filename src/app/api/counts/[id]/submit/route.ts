import { withRouteTiming } from "@/lib/perf";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { upsertDailyCountEntries } from "@/server/counts";
import { countSubmitSchema } from "@/server/validation";

async function POST__handler(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const parsed = countSubmitSchema.safeParse(await req.json());
    if (!parsed.success) return badRequest("Invalid count payload: " + parsed.error.issues.map((i) => i.message).join(", "));
    const { entries, notes } = parsed.data;

    // Ensure the count exists before doing work.
    const count = await prisma.dailyCount.findUnique({ where: { id: params.id } });
    if (!count) return badRequest("Count not found");

    // Bulk-fetch the items once (avoids N+1 round-trips inside the transaction,
    // which could exceed the default 5s interactive-transaction timeout on Neon).
    const itemIds = entries.map((e) => e.itemId);
    const items = await prisma.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, currentQty: true },
    });
    const prevById = new Map(items.map((i) => [i.id, i.currentQty]));
    const validEntries = entries.filter((e) => prevById.has(e.itemId));

    await prisma.$transaction(
      async (tx) => {
        await upsertDailyCountEntries(tx, validEntries.map((e) => ({
          countId: params.id,
          itemId: e.itemId,
          countedQty: e.countedQty,
          previousQty: prevById.get(e.itemId) ?? null,
          note: e.note ?? null,
        })));
        await tx.dailyCount.update({
          where: { id: params.id },
          data: { status: "SUBMITTED", submittedAt: new Date(), notes: notes ?? null, countedById: user.id },
        });
      },
      { timeout: 20000, maxWait: 10000 }
    );

    return ok({ ok: true, saved: validEntries.length });
  } catch (e) {
    return serverError(e);
  }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const POST = withRouteTiming("POST", "/api/counts/[id]/submit", POST__handler);
