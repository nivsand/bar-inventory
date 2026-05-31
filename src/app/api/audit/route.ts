import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

// Audit log query with filters. Admin only.
// Filters: userId, action (CREATE/UPDATE/DELETE), entity, from, to (ISO dates).
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;
    const userId = sp.get("userId") || undefined;
    const action = sp.get("action") || undefined;
    const entity = sp.get("entity") || undefined;
    const from = sp.get("from");
    const to = sp.get("to");

    const where: any = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    // Distinct entity types present, for the filter dropdown.
    const entities = await prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } });

    return ok({ logs, entities: entities.map((e) => e.entity) });
  } catch (e) {
    return serverError(e);
  }
}
