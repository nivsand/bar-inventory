// Always render fresh from the DB — never serve cached/stale data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

    const [dbUser, items, suppliers, openOrders, pendingCounts, todayCount, openPrepTasks, pendingDeliveries] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { area: true } }),
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

    const area = dbUser?.area ?? null;
    // Overdue prep = planned/in-progress tasks whose due date has passed.
    const overduePrep = openPrepTasks.filter((tk) => tk.dueDate && new Date(tk.dueDate) < dayStart && tk.status !== "DONE");
    // Employees with a focus area only see that area's prep tasks.
    const prepForUser = (!manager && area) ? openPrepTasks.filter((tk) => (tk.prepItem.item.area || "KITCHEN") === area) : openPrepTasks;

    return ok({
      user: { name: user.name, role: user.role, area },
      isManager: manager,
      counts: {
        lowStock: lowStock.length, critical: critical.length,
        openOrders: openOrders.length, pendingApprovals: pendingCounts.length,
        ordersDueToday: ordersDueToday.length, deliveriesToday: deliveriesToday.length,
        prepTasks: prepForUser.length, pendingDeliveries: pendingDeliveries.length,
        overduePrep: overduePrep.length,
      },
      todayCount: todayCount ? { id: todayCount.id, status: todayCount.status, countedBy: todayCount.countedBy?.name } : null,
      lowStock, critical, openOrders, pendingCounts, ordersDueToday, deliveriesToday,
      prepTasks: prepForUser, pendingDeliveries, overduePrep,
    });
  } catch (e) {
    return serverError(e);
  }
}