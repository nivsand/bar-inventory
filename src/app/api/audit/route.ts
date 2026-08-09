import { withRouteTiming } from "@/lib/perf";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

// Audit log query with filters. Admin only.
// Filters: userId, action (CREATE/UPDATE/DELETE), entity, from, to (ISO dates).
async function GET__handler(req: Request) {
  try {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;
    const userId = sp.get("userId") || undefined;
    const action = sp.get("action") || undefined;
    const entity = sp.get("entity") || undefined;
    const from = sp.get("from");
    const to = sp.get("to");
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 500) || 500, 1), 500);
    const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
    const includeMeta = sp.get("includeMeta") !== "0";

    const where: any = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
    }

    const logsPromise = prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        userId: true,
        entity: true,
        entityId: true,
        action: true,
        field: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit + 1,
    });

    // Distinct entity types are stable metadata for the filter dropdown; callers
    // can skip it on filter/page requests and reuse the first load.
    const entitiesPromise = includeMeta
      ? prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } })
      : Promise.resolve([]);

    const [rows, entities] = await Promise.all([logsPromise, entitiesPromise]);
    const hasMore = rows.length > limit;
    const logs = hasMore ? rows.slice(0, limit) : rows;

    return ok({ logs, entities: entities.map((e) => e.entity), limit, offset, nextOffset: offset + logs.length, hasMore });
  } catch (e) {
    return serverError(e);
  }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const GET = withRouteTiming("GET", "/api/audit", GET__handler);
