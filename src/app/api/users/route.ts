import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, created, serverError, forbidden, badRequest } from "@/lib/api";
import { logAudit } from "@/server/audit";
import { canCreateUserWithRole, Role } from "@/lib/permissions";
import bcrypt from "bcryptjs";
import { z } from "zod";

export async function GET() {
  try {
    await requireManager();
    return ok(
      await prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, isActive: true, locale: true },
        orderBy: { name: "asc" },
      })
    );
  } catch (e) {
    return serverError(e);
  }
}

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]).default("EMPLOYEE"),
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
      data: { name: data.name, email: data.email, role: data.role, passwordHash },
    });
    await logAudit({ userId: actor.id, entity: "User", entityId: u.id, action: "CREATE", changes: { role: { old: null, new: u.role } } });
    return created({ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive });
  } catch (e: any) {
    if (e?.code === "P2002") return badRequest("Email already in use");
    return serverError(e);
  }
}
