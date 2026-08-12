import { withRouteTiming } from "@/lib/perf";
import { requireManager } from "@/lib/auth";
import { ok, serverError, badRequest } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { getOrderReceivingView, saveOrderReceiving } from "@/server/receiving";
import { z } from "zod";

// Receiving review for one order. Reading/saving NEVER changes stock —
// inventory is updated only when the order moves to ARRIVED
// (see PATCH /api/orders/[id] -> applyOrderReceiving).
async function GET__handler(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireManager();
    return ok(await getOrderReceivingView(params.id));
  } catch (e) { return serverError(e); }
}

const schema = z.object({
  notes: z.string().nullable().optional(),
  lines: z.array(
    z.object({
      itemId: z.string().min(1),
      receivedQty: z.number().nonnegative(),
      isMissing: z.boolean().optional(),
      isShort: z.boolean().optional(),
      note: z.string().nullable().optional(),
    })
  ).min(1),
});

async function PUT__handler(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireManager();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join(", "));

    const receiving = await saveOrderReceiving(params.id, user.id, parsed.data);
    await logAudit({ userId: user.id, entity: "Delivery", entityId: receiving.id, action: "UPDATE" });
    return ok(await getOrderReceivingView(params.id));
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const GET = withRouteTiming("GET", "/api/orders/[id]/receiving", GET__handler);
export const PUT = withRouteTiming("PUT", "/api/orders/[id]/receiving", PUT__handler);
