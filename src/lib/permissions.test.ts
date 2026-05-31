import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canCreateUserWithRole, canEditUser, canAssignAdmin, canDeleteUser, canManageUsers,
} from "./permissions";

test("employees cannot manage users at all", () => {
  assert.equal(canManageUsers("EMPLOYEE"), false);
  assert.equal(canCreateUserWithRole("EMPLOYEE", "EMPLOYEE"), false);
  assert.equal(canDeleteUser("EMPLOYEE"), false);
});

test("manager cannot create admin or manager — employees only", () => {
  assert.equal(canCreateUserWithRole("MANAGER", "EMPLOYEE"), true);
  assert.equal(canCreateUserWithRole("MANAGER", "MANAGER"), false);
  assert.equal(canCreateUserWithRole("MANAGER", "ADMIN"), false);
});

test("admin can create any role", () => {
  assert.equal(canCreateUserWithRole("ADMIN", "EMPLOYEE"), true);
  assert.equal(canCreateUserWithRole("ADMIN", "MANAGER"), true);
  assert.equal(canCreateUserWithRole("ADMIN", "ADMIN"), true);
});

test("only admin may assign the admin role", () => {
  assert.equal(canAssignAdmin("MANAGER"), false);
  assert.equal(canAssignAdmin("EMPLOYEE"), false);
  assert.equal(canAssignAdmin("ADMIN"), true);
});

test("manager may edit employee basics but not role/active; not other managers/admins", () => {
  assert.equal(canEditUser("MANAGER", "EMPLOYEE", { role: "EMPLOYEE" }), true);
  assert.equal(canEditUser("MANAGER", "EMPLOYEE", {}), true);
  assert.equal(canEditUser("MANAGER", "EMPLOYEE", { role: "MANAGER" }), false); // promote -> denied
  assert.equal(canEditUser("MANAGER", "EMPLOYEE", { isActive: false }), false); // deactivate -> denied
  assert.equal(canEditUser("MANAGER", "MANAGER", {}), false);                   // edit a manager -> denied
  assert.equal(canEditUser("MANAGER", "ADMIN", {}), false);
});

test("admin may edit anyone, including roles and activation", () => {
  assert.equal(canEditUser("ADMIN", "ADMIN", { role: "EMPLOYEE" }), true);
  assert.equal(canEditUser("ADMIN", "EMPLOYEE", { role: "ADMIN", isActive: false }), true);
});

test("only admin may delete/deactivate", () => {
  assert.equal(canDeleteUser("ADMIN"), true);
  assert.equal(canDeleteUser("MANAGER"), false);
});
