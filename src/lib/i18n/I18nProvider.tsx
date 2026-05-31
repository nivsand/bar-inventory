"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { dict, Locale, TKey, rtlLocales } from "./translations";

type Ctx = {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: (key: TKey) => string;
  setLocale: (l: Locale) => void;
  name: (e: { nameHe?: string | null; nameEn?: string | null }) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children, initialLocale = "he" }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const saved = (typeof window !== "undefined" && (localStorage.getItem("locale") as Locale)) || null;
    if (saved && saved !== locale) setLocaleState(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dir = rtlLocales.includes(locale) ? "rtl" : "ltr";

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.documentElement.dir = dir;
    }
  }, [locale, dir]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") localStorage.setItem("locale", l);
    fetch("/api/me/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: l }) }).catch(() => {});
  }, []);

  const t = useCallback((key: TKey) => dict[locale][key] ?? dict.en[key] ?? key, [locale]);
  const name = useCallback(
    (e: { nameHe?: string | null; nameEn?: string | null }) =>
      (locale === "he" ? e.nameHe : e.nameEn) || e.nameEn || e.nameHe || "",
    [locale]
  );

  return <I18nContext.Provider value={{ locale, dir, t, setLocale, name }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
