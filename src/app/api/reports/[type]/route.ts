import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export async function GET(req: Request, { params }: { params: { type: string } }) {
  try {
    await requireManager();
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "csv";
    let rows: Record<string, any>[] = [];

    switch (params.type) {
      case "inventory": {
        const adj = await prisma.inventoryAdjustment.findMany({ include: { item: true }, orderBy: { createdAt: "desc" }, take: 1000 });
        rows = adj.map((a) => ({ date: a.createdAt.toISOString(), item: a.item.nameEn, source: a.source, delta: a.delta, resultQty: a.resultQty }));
        break;
      }
      case "orders": {
        const o = await prisma.order.findMany({ include: { supplier: true, items: true }, orderBy: { createdAt: "desc" }, take: 1000 });
        rows = o.map((x) => ({ date: x.createdAt.toISOString(), supplier: x.supplier.nameEn, status: x.status, items: x.items.length }));
        break;
      }
      case "waste": {
        const w = await prisma.wasteEntry.findMany({ include: { item: true, user: true }, orderBy: { createdAt: "desc" }, take: 1000 });
        rows = w.map((x) => ({ date: x.createdAt.toISOString(), item: x.item.nameEn, qty: x.qty, unit: x.unit, reason: x.reason, user: x.user.name }));
        break;
      }
      case "supplier-performance": {
        const d = await prisma.delivery.findMany({ include: { order: { include: { supplier: true } }, items: true } });
        const map = new Map<string, { supplier: string; deliveries: number; shortages: number }>();
        for (const x of d) {
          const name = x.order?.supplier.nameEn || "—";
          const m = map.get(name) || { supplier: name, deliveries: 0, shortages: 0 };
          m.deliveries++; if (x.hasShortage) m.shortages++; map.set(name, m);
        }
        rows = [...map.values()];
        break;
      }
      case "deliveries": {
        const d = await prisma.delivery.findMany({ include: { order: { include: { supplier: true } }, receivedBy: true, items: true }, orderBy: { receivedAt: "desc" }, take: 1000 });
        rows = d.map((x) => ({ date: x.receivedAt.toISOString(), supplier: x.order?.supplier.nameEn || "—", status: x.status, items: x.items.length, shortage: x.hasShortage ? "yes" : "", receivedBy: x.receivedBy?.name }));
        break;
      }
      case "inventory-by-category": {
        const items = await prisma.inventoryItem.findMany({ where: { isActive: true }, include: { category: true } });
        const map = new Map<string, { category: string; quantity: number; items: number }>();
        for (const i of items) {
          const cat = i.category?.nameEn || "Uncategorized";
          const m = map.get(cat) || { category: cat, quantity: 0, items: 0 };
          m.quantity += i.currentQty; m.items++; map.set(cat, m);
        }
        rows = [...map.values()].map((m) => ({ ...m, quantity: Math.round(m.quantity * 100) / 100 }));
        break;
      }
      case "consumption": {
        const a = await prisma.inventoryAdjustment.findMany({ where: { source: { in: ["PREP_CONSUMPTION", "WASTE", "SALE"] } }, include: { item: true } });
        const map = new Map<string, { item: string; consumed: number }>();
        for (const x of a) {
          const m = map.get(x.item.nameEn) || { item: x.item.nameEn, consumed: 0 };
          m.consumed += Math.abs(x.delta); map.set(x.item.nameEn, m);
        }
        rows = [...map.values()];
        break;
      }
      default: return badRequest("Unknown report type");
    }

    // In-app tables fetch JSON; the export buttons fetch CSV (default).
    if (format === "json") return ok({ rows });

    const csv = toCsv(rows);
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${params.type}.csv"` },
    });
  } catch (e) { return serverError(e); }
}
