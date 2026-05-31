import { requireUser, isManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";
import { startOfDay, endOfDay } from "date-fns";

export async function GET() {
  try {
    const user = await requireUser();
    const manager = isManager(user.role);
    const today = new Date();
    const dow = today.getDay();
    const dayStart = startOfDay(today), dayEnd = endOfDay(today);

    const [items, suppliers, openOrders, pendingCounts, todayCount, openPrepTasks, pendingDeliveries] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { isActive: true }, include: { supplier: true } }),
      prisma.supplier.findMany({ where: { isActive: true } }),
      prisma.order.findMany({
        where: { status: { in: ["NEED_TO_ORDER", "ORDERED", "PARTIALLY_DELIVERED", "MISSING_ITEMS", "PROBLEM"] } },
        include: { supplier: true }, orderBy: { createdAt: "desc" },
      }),
      prisma.dailyCount.findMany({ where: { status: "SUBMITTED" }, include: { countedBy: true } }),
      prisma.dailyCount.findFirst({ where: { businessDay: { gte: dayStart, lte: dayEnd } }, orderBy: { createdAt: "desc" }, include: { countedBy: true } }),
      prisma.prepTask.findMany({
        where: { status: { in: ["SUGGESTED", "PLANNED", "IN_PROGRESS"] } },
        include: { prepItem: { include: { item: true } }, assignee: true },
        orderBy: { createdAt: "desc" }, take: 50,
      }),
      prisma.delivery.findMany({ where: { status: "SUBMITTED" }, include: { receivedBy: true }, orderBy: { receivedAt: "desc" } }),
    ]);

    const lowStock = items.filter((i) => i.currentQty < i.minQty);
    const critical = items.filter((i) => i.minQty > 0 && i.currentQty <= i.minQty * 0.5);
    const ordersDueToday = suppliers.filter((s) => s.orderDeadlineDays.includes(dow));
    const deliveriesToday = suppliers.filter((s) => s.deliveryDays.includes(dow));

    return ok({
      user: { name: user.name, role: user.role },
      isManager: manager,
      counts: {
        lowStock: lowStock.length, critical: critical.length,
        openOrders: openOrders.length, pendingApprovals: pendingCounts.length,
        ordersDueToday: ordersDueToday.length, deliveriesToday: deliveriesToday.length,
        prepTasks: openPrepTasks.length, pendingDeliveries: pendingDeliveries.length,
      },
      todayCount: todayCount ? { id: todayCount.id, status: todayCount.status, countedBy: todayCount.countedBy?.name } : null,
      lowStock, critical, openOrders, pendingCounts, ordersDueToday, deliveriesToday,
      prepTasks: openPrepTasks, pendingDeliveries,
    });
  } catch (e) {
    return serverError(e);
  }
}
