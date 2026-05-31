import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError } from "@/lib/api";

export async function GET() {
  try {
    await requireUser();
    const counts = await prisma.dailyCount.findMany({
      include: { countedBy: true, approvedBy: true, _count: { select: { entries: true } } },
      orderBy: { businessDay: "desc" }, take: 60,
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
