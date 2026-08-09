import { withRouteTiming } from "@/lib/perf";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";

async function POST__handler(req: Request) {
  try {
    const user = await requireUser();
    const { locale } = await req.json();
    if (!["he", "en"].includes(locale)) return badRequest("Invalid locale");
    await prisma.user.update({ where: { id: user.id }, data: { locale } });
    return ok({ locale });
  } catch (e) { return serverError(e); }
}

// --- dev-only request timing (see src/lib/perf.ts) ---
export const POST = withRouteTiming("POST", "/api/me/locale", POST__handler);
