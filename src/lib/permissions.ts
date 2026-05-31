// Pure, dependency-free authorization rules for user management.
// Used by the API routes (server-side enforcement) and unit-tested directly.
export type Role = "EMPLOYEE" | "MANAGER" | "ADMIN";

export function canManageUsers(role: Role): boolean {
  return role === "MANAGER" || role === "ADMIN";
}

/** Who may create a user with a given role. Only admins may create MANAGER/ADMIN. */
export function canCreateUserWithRole(actor: Role, targetRole: Role): boolean {
  if (!canManageUsers(actor)) return false;
  if (targetRole === "EMPLOYEE") return true;
  return actor === "ADMIN";
}

/** Only an admin may assign the ADMIN role. */
export function canAssignAdmin(actor: Role): boolean {
  return actor === "ADMIN";
}

/**
 * Whether `actor` may apply `changes` to a user that currently has `targetRole`.
 * Managers may edit EMPLOYEE accounts only, may not change roles, and may not
 * (de)activate accounts. Admins may do anything.
 */
export function canEditUser(
  actor: Role,
  targetRole: Role,
  changes: { role?: Role; isActive?: boolean }
): boolean {
  if (!canManageUsers(actor)) return false;
  if (actor === "ADMIN") return true;
  if (targetRole !== "EMPLOYEE") return false;
  if (changes.role && changes.role !== "EMPLOYEE") return false;
  if (changes.isActive !== undefined) return false;
  return true;
}

/** Only an admin may delete/deactivate users. */
export function canDeleteUser(actor: Role): boolean {
  return actor === "ADMIN";
}
