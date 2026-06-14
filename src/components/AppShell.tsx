"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { TKey } from "@/lib/i18n/translations";
import clsx from "clsx";

const NAV: { href: string; key: TKey; managerOnly?: boolean; adminOnly?: boolean }[] = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/count", key: "dailyCount" },
  { href: "/prep", key: "prep" },
  { href: "/inventory", key: "inventory" },
  { href: "/recipes", key: "recipes", managerOnly: true },
  { href: "/categories", key: "categories", managerOnly: true },
  { href: "/locations", key: "locations", managerOnly: true },
  { href: "/orders", key: "orders", managerOnly: true },
  { href: "/deliveries", key: "deliveries" },
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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-brand-700 text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/users" className="flex flex-col leading-tight">
            <span className="font-bold text-lg">{t("appName")}</span>
            {session?.user?.name && (
              <span className="text-xs text-brand-100">{t("hi")}, {session.user.name}</span>
            )}
          </Link>
          <div className="flex items-center gap-3">
            <button onClick={() => setLocale(locale === "he" ? "en" : "he")} className="text-sm bg-brand-600 rounded-lg px-3 py-1.5">
              {locale === "he" ? "EN" : "עב"}
            </button>
            <button onClick={logout} className="text-sm bg-brand-800 rounded-lg px-3 py-1.5">
              {t("signOut")}
            </button>
          </div>
        </div>
        {/* horizontal scroll nav (mobile-first) */}
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 no-scrollbar">
          {items.map((n) => (
            <Link key={n.href} href={n.href}
              className={clsx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm",
                pathname.startsWith(n.href) ? "bg-white text-brand-700 font-semibold" : "bg-brand-600/60 text-white")}>
              {t(n.key)}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 p-4 max-w-5xl w-full mx-auto pb-24">{children}</main>
    </div>
  );
}
