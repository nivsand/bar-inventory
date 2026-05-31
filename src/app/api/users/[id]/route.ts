import { requireManager, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, serverError, forbidden, badRequest, notFound } from "@/lib/api";
import { logAudit, diff } from "@/server/audit";
import { canEditUser, canAssignAdmin, Role } from "@/lib/permissions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import bcrypt from "bcryptjs";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH).optional(),
  role: z.enum(["EMPLOYEE", "MANAGER", "ADMIN"]).optional(),
  area: z.enum(["KITCHEN", "FLOOR"]).nullable().optional(),
  isActive: z.boolean().optional(),
});

// Edit / deactivate a user.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireManager();
    const body = patchSchema.parse(await req.json());
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return notFound();

    // RBAC (server-side) — see src/lib/permissions.ts (unit-tested):
    //  - A MANAGER may only edit EMPLOYEE users, may not change roles, and may
    //    not (de)activate accounts.
    //  - Only an ADMIN may assign the ADMIN role or toggle isActive.
    if (!canEditUser(actor.role as Role, target.role as Role, { role: body.role as Role | undefined, isActive: body.isActive })) {
      return forbidden();
    }
    if (body.role === "ADMIN" && !canAssignAdmin(actor.role as Role)) return forbidden();

    // Prevent an admin from demoting / deactivating themselves (avoid lockout).
    if (actor.id === target.id) {
      if (body.role && body.role !== "ADMIN") return badRequest("You cannot change your own role");
      if (body.isActive === false) return badRequest("You cannot deactivate yourself");
    }

    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.email !== undefined) data.email = body.email;
    if (body.role !== undefined) data.role = body.role;
    if (body.area !== undefined) data.area = body.area;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);

    const updated = await prisma.user.update({ where: { id: params.id }, data });
    await logAudit({
      userId: actor.id, entity: "User", entityId: params.id, action: "UPDATE",
      changes: diff({ name: target.name, email: target.email, role: target.role, isActive: target.isActive }, {
        name: body.name, email: body.email, role: body.role, isActive: body.isActive,
      }),
    });
    return ok({ id: updated.id, name: updated.name, email: updated.email, role: updated.role, isActive: updated.isActive });
  } catch (e: any) {
    if (e?.code === "P2002") return badRequest("Email already in use");
    return serverError(e);
  }
}

// Delete a user. Admin only. Falls back to deactivation if the user has history
// (foreign-key references), so admins always have a safe way to remove access.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireAdmin();
    if (actor.id === params.id) return badRequest("You cannot delete yourself");
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return notFound();

    try {
      await prisma.user.delete({ where: { id: params.id } });
      await logAudit({ userId: actor.id, entity: "User", entityId: params.id, action: "DELETE" });
      return ok({ ok: true, deleted: true });
    } catch (e: any) {
      // P2003 = FK constraint: user has counts/orders/etc. Soft-delete instead.
      if (e?.code === "P2003" || e?.code === "P2014") {
        await prisma.user.update({ where: { id: params.id }, data: { isActive: false } });
        await logAudit({ userId: actor.id, entity: "User", entityId: params.id, action: "UPDATE", changes: { isActive: { old: true, new: false } } });
        return ok({ ok: true, deleted: false, deactivated: true });
      }
      throw e;
    }
  } catch (e) {
    return serverError(e);
  }
}
