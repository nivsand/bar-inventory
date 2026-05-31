import { prisma } from "@/lib/prisma";

/** Record a field-level change for the audit trail. */
export async function logAudit(params: {
  userId?: string; entity: string; entityId: string; action: "CREATE" | "UPDATE" | "DELETE";
  changes?: Record<string, { old: any; new: any }>;
}) {
  const { userId, entity, entityId, action, changes } = params;
  if (!changes || Object.keys(changes).length === 0) {
    await prisma.auditLog.create({ data: { userId, entity, entityId, action } });
    return;
  }
  await prisma.auditLog.createMany({
    data: Object.entries(changes).map(([field, v]) => ({
      userId, entity, entityId, action, field,
      oldValue: v.old == null ? null : String(v.old),
      newValue: v.new == null ? null : String(v.new),
    })),
  });
}

/** Compute which fields actually changed between two objects. */
export function diff<T extends Record<string, any>>(before: T, after: Partial<T>) {
  const changes: Record<string, { old: any; new: any }> = {};
  for (const k of Object.keys(after)) {
    if (after[k] !== undefined && before[k] !== after[k]) changes[k] = { old: before[k], new: after[k] };
  }
  return changes;
}
