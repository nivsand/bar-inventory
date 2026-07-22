"use client";
import clsx from "clsx";
import React from "react";
import { Search } from "lucide-react";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("card", className)}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("touch-input", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx("touch-input", props.className)} />;
}

/** Text input with a leading search icon — used for every list/table filter box. */
export function SearchInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto h-4 w-4 text-gray-400" />
      <input {...props} className={clsx("touch-input ps-11", props.className)} />
    </div>
  );
}

const STAT_TONES = {
  default: "bg-white border border-gray-100",
  ok: "tone-mint border border-transparent",
  warn: "tone-peach border border-transparent",
  danger: "bg-red-50 text-red-700 border border-transparent",
  mint: "tone-mint border border-transparent",
  sky: "tone-sky border border-transparent",
  peach: "tone-peach border border-transparent",
  lilac: "tone-lilac border border-transparent",
} as const;

export function Stat({
  label, value, tone = "default", trend,
}: {
  label: string;
  value: React.ReactNode;
  tone?: keyof typeof STAT_TONES;
  trend?: React.ReactNode;
}) {
  return (
    <div className={clsx("rounded-2xl p-5 shadow-card transition-shadow duration-200 hover:shadow-card-hover", STAT_TONES[tone])}>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      <div className="text-sm text-gray-500 mt-2 font-medium">{label}</div>
      {trend && <div className="text-xs mt-2 font-semibold">{trend}</div>}
    </div>
  );
}

const BADGE_TONES = {
  ok: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
  info: "bg-sky-bg text-sky-ink",
  neutral: "bg-gray-100 text-gray-600",
} as const;

export function Badge({
  tone = "neutral", children, className, ...rest
}: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={clsx("badge", BADGE_TONES[tone], className)} {...rest}>{children}</span>;
}

export function IconButton({ children, className, "aria-label": ariaLabel, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={ariaLabel}
      className={clsx(
        "relative flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-800",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Centered placeholder for lists/tables with nothing to show. */
export function EmptyState({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-gray-400">
      {icon}
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <div className={clsx("animate-spin h-6 w-6 rounded-full border-2 border-brand-500 border-t-transparent", className)} />;
}

/** Full-page loading state used while a screen's initial data is in flight. */
export function PageSpinner() {
  return (
    <div className="flex justify-center py-24">
      <Spinner />
    </div>
  );
}

/** Pulsing gray block for skeleton loading rows. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-lg bg-gray-100", className)} />;
}
