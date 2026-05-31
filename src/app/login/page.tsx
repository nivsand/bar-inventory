"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Card, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setError("Invalid credentials");
    else router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">{t("appName")}</h1>
          <button onClick={() => setLocale(locale === "he" ? "en" : "he")} className="btn-ghost text-sm">{locale === "he" ? "EN" : "עב"}</button>
        </div>
        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          {/* Honeypot fields discourage browsers from autofilling the real inputs */}
          <input type="text" name="username" autoComplete="username" className="hidden" tabIndex={-1} aria-hidden="true" />
          <input type="password" name="password" autoComplete="new-password" className="hidden" tabIndex={-1} aria-hidden="true" />
          <Field label={t("email")}>
            <Input type="email" name="login-email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} />
          </Field>
          <Field label={t("password")}>
            <Input type="password" name="login-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button className="btn-primary w-full h-14 text-lg" disabled={loading}>{t("signIn")}</button>
        </form>
      </Card>
    </div>
  );
}
