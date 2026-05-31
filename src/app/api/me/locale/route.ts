import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { locale } = await req.json();
    if (!["he", "en"].includes(locale)) return badRequest("Invalid locale");
    await prisma.user.update({ where: { id: user.id }, data: { locale } });
    return ok({ locale });
  } catch (e) { return serverError(e); }
}
