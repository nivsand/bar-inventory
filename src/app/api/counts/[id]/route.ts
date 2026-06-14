// Always render fresh from the DB — never serve cached/stale data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, notFound } from "@/lib/api";

// Full detail of a single daily count for the review screen. Manager/Admin only.
// Returns the counter, timestamps, status, and every entry with its item
// (name, unit, area) + counted quantity + note.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireManager();
    const count = await prisma.dailyCount.findUnique({
      where: { id: params.id },
      include: {
        countedBy: { select: { name: true, email: true } },
        approvedBy: { select: { name: true } },
        location: true,
        entries: {
          include: { item: { select: { nameHe: true, nameEn: true, unit: true, area: true } } },
          orderBy: { item: { nameEn: "asc" } },
        },
      },
    });
    if (!count) return notFound();
    return ok(count);
  } catch (e) {
    return serverError(e);
  }
}