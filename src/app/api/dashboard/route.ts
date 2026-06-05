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

    const [dbUser, items, suppliers, openOrdersCount, pendingCounts, todayCount, openPrepTasks, pendingDeliveries] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { area: true } }),
      // Select only fields needed for low-stock/critical computation and list display.
      // Removed include: { supplier } — supplier not rendered on the dashboard.
      prisma.inventoryItem.findMany({
        where: { isActive: true },
        select: { id: true, nameHe: true, nameEn: true, currentQty: true, minQty: true, unit: true, area: true },
      }),
      // Select only scheduling fields used for ordersDueToday / deliveriesToday.
      prisma.supplier.findMany({
        where: { isActive: true },
        select: { id: true, orderDeadlineDays: true, deliveryDays: true },
      }),
      // Count only — the open orders array is not rendered on the dashboard page.
      prisma.order.count({
        where: { status: { in: ["NEED_TO_ORDER", "ORDERED", "PARTIALLY_DELIVERED", "MISSING_ITEMS", "PROBLEM"] } },
      }),
      prisma.dailyCount.findMany({ where: { status: "SUBMITTED" }, include: { countedBy: true }, take: 20 }),
      prisma.dailyCount.findFirst({ where: { businessDay: { gte: dayStart, lte: dayEnd } }, orderBy: { createdAt: "desc" }, include: { countedBy: true } }),
      prisma.prepTask.findMany({
        where: { status: { in: ["SUGGESTED", "PLANNED", "IN_PROGRESS"] } },
        include: { prepItem: { include: { item: true } }, assignee: true },
        orderBy: { createdAt: "desc" }, take: 50,
      }),
      prisma.delivery.findMany({ where: { status: "SUBMITTED" }, include: { receivedBy: true }, orderBy: { receivedAt: "desc" }, take: 20 }),
    ]);

    const lowStock = items.filter((i) => i.currentQty < i.minQty);
    const critical = items.filter((i) => i.minQty > 0 && i.currentQty <= i.minQty * 0.5);
    const ordersDueTodayCount = suppliers.filter((s) => s.orderDeadlineDays.includes(dow)).length;
    const deliveriesTodayCount = suppliers.filter((s) => s.deliveryDays.includes(dow)).length;

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
        openOrders: openOrdersCount, pendingApprovals: pendingCounts.length,
        ordersDueToday: ordersDueTodayCount, deliveriesToday: deliveriesTodayCount,
        prepTasks: prepForUser.length, pendingDeliveries: pendingDeliveries.length,
        overduePrep: overduePrep.length,
      },
      todayCount: todayCount ? { id: todayCount.id, status: todayCount.status, countedBy: todayCount.countedBy?.name } : null,
      lowStock, critical, pendingCounts, pendingDeliveries,
      prepTasks: prepForUser, overduePrep,
    });
  } catch (e) {
    return serverError(e);
  }
}
