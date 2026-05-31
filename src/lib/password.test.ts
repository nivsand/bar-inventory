import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePassword, MIN_PASSWORD_LENGTH } from "./password";

test("rejects empty / missing", () => {
  assert.equal(validatePassword("").ok, false);
  assert.equal(validatePassword(undefined).ok, false);
  assert.equal(validatePassword(null).ok, false);
});

test("rejects passwords shorter than the minimum", () => {
  assert.equal(validatePassword("a".repeat(MIN_PASSWORD_LENGTH - 1)).ok, false);
});

test("accepts passwords at or above the minimum", () => {
  assert.equal(validatePassword("a".repeat(MIN_PASSWORD_LENGTH)).ok, true);
  assert.equal(validatePassword("longenoughpassword").ok, true);
});
