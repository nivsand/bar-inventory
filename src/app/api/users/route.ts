import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError, forbidden, badRequest } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { canCreateUserWithRole, Role } from "@/lib/permissions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import bcrypt from "bcryptjs";
import { z } from "zod";

export async function GET() {
  try {
    await requireManager();
    return ok(
      await prisma.user.findMany({
        select: { id: true, username: true, name: true, email: true, role: true, area: true, isActive: true, locale: true },
        orderBy: { name: "asc" },
      })
    );
  } catch (e) {
    return serverError(e);
  }
}

const schema = z.object({
  username: z.string().min(1).transform((v) => v.toLowerCase()),
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH).optional(),
  role: z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]).default("EMPLOYEE"),
  area: z.enum(["KITCHEN", "FLOOR"]).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    // Must be at least a manager to create users.
    const actor = await requireManager();
    const data = schema.parse(await req.json());

    // Server-side RBAC (not just UI):
    //  - Only an ADMIN may create MANAGER or ADMIN accounts.
    //  - A MANAGER may create EMPLOYEE accounts only.
    if (!canCreateUserWithRole(actor.role as Role, data.role)) {
      return forbidden();
    }

    const passwordHash = await bcrypt.hash(data.password || "password123", 10);
    const u = await prisma.user.create({
      data: { username: data.username, name: data.name, email: data.email || null, role: data.role, area: data.area ?? null, passwordHash },
    });
    await logAudit({ userId: actor.id, entity: "User", entityId: u.id, action: "CREATE", changes: { role: { old: null, new: u.role } } });
    return created({ id: u.id, username: u.username, name: u.name, email: u.email, role: u.role, isActive: u.isActive });
  } catch (e: any) {
    if (e?.code === "P2002") return badRequest("Username already in use");
    return serverError(e);
  }
}
