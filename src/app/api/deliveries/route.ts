import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError, badRequest } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { z } from "zod";

export async function GET() {
  try {
    await requireUser();
    const deliveries = await prisma.delivery.findMany({
      include: {
        order: { include: { supplier: true } },
        supplier: true,
        items: { include: { item: true } },
        receivedBy: true,
        approvedBy: true,
      },
      orderBy: { receivedAt: "desc" },
      take: 100,
    });
    return ok(deliveries);
  } catch (e) {
    return serverError(e);
  }
}

const schema = z.object({
  orderId: z.string().nullable().optional(),
  supplierId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  documentUrl: z.string().nullable().optional(),
  ocrRaw: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "SUBMITTED"]).default("SUBMITTED"),
  items: z.array(
    z.object({
      itemId: z.string().min(1),
      orderedQty: z.number().nullable().optional(),
      receivedQty: z.number().nonnegative(),
      unit: z.string().min(1),
      isMissing: z.boolean().optional(),
      isShort: z.boolean().optional(),
      note: z.string().nullable().optional(),
    })
  ).min(1),
});

// Create a received-goods REPORT. Any authenticated user (incl. employees) can
// submit one. This NEVER updates inventory — a manager/admin must approve first
// (see /api/deliveries/[id]/approve).
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
    const body = parsed.data;

    const hasShortage = body.items.some((i) => i.isMissing || i.isShort);
    const delivery = await prisma.delivery.create({
      data: {
        orderId: body.orderId ?? null,
        supplierId: body.supplierId ?? null,
        receivedById: user.id,
        notes: body.notes ?? null,
        documentUrl: body.documentUrl ?? null,
        ocrRaw: body.ocrRaw ?? null,
        status: body.status,
        confirmed: false,
        hasShortage,
        items: {
          create: body.items.map((i) => ({
            itemId: i.itemId,
            orderedQty: i.orderedQty ?? null,
            receivedQty: i.receivedQty,
            unit: i.unit,
            isMissing: !!i.isMissing,
            isShort: !!i.isShort,
            note: i.note ?? null,
          })),
        },
      },
      include: { items: true },
    });
    await logAudit({ userId: user.id, entity: "Delivery", entityId: delivery.id, action: "CREATE" });
    return created(delivery);
  } catch (e) {
    return serverError(e);
  }
}
