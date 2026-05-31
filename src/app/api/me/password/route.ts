import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, badRequest } from "@/lib/api";
import { validatePassword } from "@/lib/password";
import { logAudit } from "@/server/audit";
import bcrypt from "bcryptjs";

// Self-service: a logged-in user changes their OWN password.
// Requires the current password and a valid new password. Never returns or
// stores plaintext; uses the same bcrypt hashing as login/seed.
export async function POST(req: Request) {
  try {
    const session = await requireUser();
    const { currentPassword, newPassword } = await req.json();

    if (typeof currentPassword !== "string" || !currentPassword) return badRequest("Current password is required");
    const check = validatePassword(newPassword);
    if (!check.ok) return badRequest(check.error);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return badRequest("Current password is incorrect");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await logAudit({ userId: user.id, entity: "User", entityId: user.id, action: "UPDATE", changes: { password: { old: "***", new: "***" } } });

    return ok({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
