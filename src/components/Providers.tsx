"use client";
import React, { Profiler } from "react";
import { SessionProvider } from "next-auth/react";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { Locale } from "@/lib/i18n/translations";

declare global {
  interface Window {
    __REACT_RENDER_EVENTS__?: Array<{
      id: string;
      phase: "mount" | "update" | "nested-update";
      actualDuration: number;
      baseDuration: number;
      startTime: number;
      commitTime: number;
      path: string;
    }>;
  }
}

function onRender(
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
) {
  if (process.env.NEXT_PUBLIC_BENCHMARK !== "1" || typeof window === "undefined") return;
  window.__REACT_RENDER_EVENTS__ ||= [];
  window.__REACT_RENDER_EVENTS__.push({
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
    path: window.location.pathname,
  });
}

export function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const content = process.env.NEXT_PUBLIC_BENCHMARK === "1"
    ? <Profiler id="app-root" onRender={onRender}>{children}</Profiler>
    : children;

  return (
    <SessionProvider>
      <I18nProvider initialLocale={initialLocale}>{content}</I18nProvider>
    </SessionProvider>
  );
}
