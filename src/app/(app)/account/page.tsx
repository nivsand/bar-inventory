"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Field, Input } from "@/components/ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export default function AccountPage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const user = session?.user as any;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess(false);
    if (next.length < MIN_PASSWORD_LENGTH) { setError(t("passwordTooShort")); return; }
    if (next !== confirm) { setError(t("passwordsDoNotMatch")); return; }
    setSaving(true);
    try {
      await api("/api/me/password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      setSuccess(true); setCurrent(""); setNext(""); setConfirm("");
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-md">
      <h1 className="text-2xl font-bold">{t("account")}</h1>

      <Card>
        <p className="font-medium">{user?.name}</p>
        <p className="text-sm text-gray-500">{user?.email} · {user?.role}</p>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">{t("changePassword")}</h2>
        <form onSubmit={submit} className="space-y-3">
          <Field label={t("currentPassword")}>
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label={t("newPassword")}>
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label={t("confirmPassword")}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <p className="text-xs text-gray-400">{t("passwordRule")}</p>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          {success && <p className="text-emerald-700 text-sm">✓ {t("passwordChanged")}</p>}
          <button className="btn-primary w-full" disabled={saving || !current || !next || !confirm}>{t("changePassword")}</button>
        </form>
      </Card>
    </div>
  );
}
