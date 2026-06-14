import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireManager();
    await prisma.productMapping.delete({ where: { id: params.id } });
    return ok({ ok: true });
  } catch (e) { return serverError(e); }
}
