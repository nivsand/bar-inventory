// Always render fresh from the DB — never serve cached/stale data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";

export async function GET(req: Request) {
  try {
    await requireUser();
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || undefined;       // DRAFT/SUBMITTED/APPROVED/REJECTED
    const employeeId = sp.get("employeeId") || undefined;
    const from = sp.get("from");
    const to = sp.get("to");

    const where: any = {};
    if (status) where.status = status;
    if (employeeId) where.countedById = employeeId;
    if (from || to) {
      where.businessDay = {};
      if (from) where.businessDay.gte = new Date(from);
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.businessDay.lte = d; }
    }

    const counts = await prisma.dailyCount.findMany({
      where,
      include: { countedBy: true, approvedBy: true, _count: { select: { entries: true } } },
      orderBy: [{ businessDay: "desc" }, { createdAt: "desc" }],
      take: 300,
    });
    return ok(counts);
  } catch (e) { return serverError(e); }
}

// Create or fetch today's draft for the current user
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const day = body.businessDay ? new Date(body.businessDay) : new Date();
    day.setHours(0, 0, 0, 0);
    const count = await prisma.dailyCount.create({
      data: { businessDay: day, countedById: user.id, status: "DRAFT" },
      include: { entries: true },
    });
    return created(count);
  } catch (e) { return serverError(e); }
}