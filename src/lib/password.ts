// Shared, dependency-free password policy. Used by every endpoint that sets a
// password so the rule lives in exactly one place (and is unit-tested).
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordCheck = { ok: true } | { ok: false; error: string };

export function validatePassword(pw: unknown): PasswordCheck {
  if (typeof pw !== "string" || pw.length === 0) return { ok: false, error: "Password is required" };
  if (pw.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  return { ok: true };
}
