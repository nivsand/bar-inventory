"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Card, Field, Input } from "@/components/ui";
import { BrandIcon, LanguagesIcon } from "@/components/icons";

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await signIn("credentials", { username, password, redirect: false });
    setLoading(false);
    if (res?.error) setError("Invalid credentials");
    else router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-sm shadow-card-hover">
        <div className="flex flex-col items-center text-center mb-6 gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-btn">
            <BrandIcon className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold text-gray-900">{t("appName")}</h1>
        </div>
        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          <input type="text" name="email" autoComplete="username" className="hidden" tabIndex={-1} aria-hidden="true" />
          <input type="password" name="password" autoComplete="new-password" className="hidden" tabIndex={-1} aria-hidden="true" />
          <Field label={t("username")}>
            <Input type="text" name="login-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} />
          </Field>
          <Field label={t("password")}>
            <Input type="password" name="login-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          {error && <p className="text-red-600 text-sm font-medium">{error}</p>}
          <button className="btn-primary w-full h-14 text-lg" disabled={loading}>{t("signIn")}</button>
        </form>
        <button onClick={() => setLocale(locale === "he" ? "en" : "he")} className="mt-5 mx-auto flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <LanguagesIcon className="h-4 w-4" />{locale === "he" ? "English" : "עברית"}
        </button>
      </Card>
    </div>
  );
}
