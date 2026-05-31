"use client";
import clsx from "clsx";
import React from "react";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("card", className)}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("touch-input", props.className)} />;
}

export function Stat({ label, value, tone = "default" }: { label: string; value: React.ReactNode; tone?: "default" | "warn" | "danger" | "ok" }) {
  const tones = {
    default: "bg-white", warn: "bg-amber-50 border-amber-200",
    danger: "bg-red-50 border-red-200", ok: "bg-emerald-50 border-emerald-200",
  } as const;
  return (
    <div className={clsx("rounded-2xl border p-4", tones[tone])}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
    </div>
  );
}

export function Spinner() {
  return <div className="animate-spin h-6 w-6 rounded-full border-2 border-brand-500 border-t-transparent" />;
}
