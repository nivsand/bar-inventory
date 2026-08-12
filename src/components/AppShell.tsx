"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { TKey } from "@/lib/i18n/translations";
import clsx from "clsx";
import { BrandIcon, LanguagesIcon, LogOutIcon, NAV_ICONS } from "@/components/icons";
import { IconButton } from "@/components/ui";

const NAV: { href: string; key: TKey; managerOnly?: boolean; adminOnly?: boolean }[] = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/count", key: "dailyCount" },
  { href: "/prep", key: "prep" },
  { href: "/inventory", key: "inventory" },
  { href: "/recipes", key: "recipes", managerOnly: true },
  { href: "/categories", key: "categories", managerOnly: true },
  { href: "/locations", key: "locations", managerOnly: true },
  // Receiving goods lives inside the order workflow (/orders) — no separate page.
  { href: "/orders", key: "orders", managerOnly: true },
  { href: "/suppliers", key: "suppliers", managerOnly: true },
  { href: "/waste", key: "waste" },
  { href: "/reports", key: "reports", managerOnly: true },
  { href: "/audit", key: "audit", adminOnly: true },
  // Merged Users + Account: managers manage users here, everyone changes their own password.
  { href: "/users", key: "account" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const { data: session } = useSession();
  const pathname = usePathname();
  const role = (session?.user as any)?.role;
  const isManager = role === "MANAGER" || role === "ADMIN";
  const isAdmin = role === "ADMIN";
  const items = NAV.filter((n) => (!n.managerOnly || isManager) && (!n.adminOnly || isAdmin));

  // Sign out without redirect, then navigate relative to the CURRENT origin.
  // This stays correct on any port / preview / production URL and never depends
  // on a hard-coded NEXTAUTH_URL.
  async function logout() {
    await signOut({ redirect: false });
    window.location.assign("/login");
  }

  const Brand = (
    <Link href="/users" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-brand-600 text-white">
        <BrandIcon className="h-[18px] w-[18px]" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-bold text-gray-900">{t("appName")}</span>
        {session?.user?.name && <span className="text-xs text-gray-500">{t("hi")}, {session.user.name}</span>}
      </span>
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* ---------- Sidebar (tablet / desktop) ---------- */}
      <aside className="hidden md:flex md:sticky md:top-0 md:h-screen md:w-64 md:flex-none md:flex-col border-e border-gray-200 bg-white px-4 py-6">
        <div className="px-2 mb-6">{Brand}</div>
        <nav className="flex-1 flex flex-col gap-1 overflow-y-auto">
          {items.map((n) => {
            const active = pathname.startsWith(n.href);
            const Icon = NAV_ICONS[n.key];
            return (
              <Link key={n.href} href={n.href}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors duration-150",
                  active ? "bg-brand-100 text-brand-800" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                )}>
                {Icon && <Icon className="h-[18px] w-[18px] flex-none" />}
                {t(n.key)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-gray-400">{role}</span>
          <div className="flex items-center gap-1">
            <IconButton onClick={() => setLocale(locale === "he" ? "en" : "he")} aria-label={t("language")} title={t("language")}>
              <LanguagesIcon className="h-[18px] w-[18px]" />
            </IconButton>
            <IconButton onClick={logout} aria-label={t("signOut")} title={t("signOut")}>
              <LogOutIcon className="h-[18px] w-[18px]" />
            </IconButton>
          </div>
        </div>
      </aside>

      {/* ---------- Header + horizontal nav (phone) ---------- */}
      <header className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center justify-between px-4 h-16">
          {Brand}
          <div className="flex items-center gap-1">
            <IconButton onClick={() => setLocale(locale === "he" ? "en" : "he")} aria-label={t("language")}>
              <LanguagesIcon className="h-[18px] w-[18px]" />
            </IconButton>
            <IconButton onClick={logout} aria-label={t("signOut")}>
              <LogOutIcon className="h-[18px] w-[18px]" />
            </IconButton>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 no-scrollbar">
          {items.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href}
                className={clsx(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150",
                  active ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"
                )}>
                {t(n.key)}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 min-w-0">
        <div className="max-w-6xl w-full mx-auto p-4 md:p-8 pb-24 md:pb-10">{children}</div>
      </main>
    </div>
  );
}
