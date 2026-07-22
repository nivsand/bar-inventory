"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { TKey } from "@/lib/i18n/translations";
import { api } from "@/lib/fetcher";
import { Card, Stat, PageSpinner, Badge, EmptyState } from "@/components/ui";
import { AlertTriangle, ChevronRight } from "lucide-react";

function ActionTile({ href, labelKey, hint }: { href: string; labelKey: TKey; hint?: string }) {
  const { t } = useI18n();
  return (
    <Link href={href} className="card flex items-center justify-between gap-2 hover:shadow-card-hover hover:-translate-y-0.5 active:scale-[0.98] transition">
      <span className="flex flex-col gap-1">
        <span className="font-semibold text-gray-900">{t(labelKey)}</span>
        {hint && <span className="text-sm text-gray-500">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 flex-none text-gray-300 rtl:rotate-180" />
    </Link>
  );
}

export default function Dashboard() {
  const { t, name } = useI18n();
  const [data, setData] = useState<any>(null);
  useEffect(() => { api("/api/dashboard").then(setData).catch(console.error); }, []);
  if (!data) return <PageSpinner />;
  const c = data.counts;

  const Greeting = (
    <div className="flex items-center gap-2 flex-wrap">
      <h1 className="text-2xl font-bold text-gray-900">{t("hi")}, {data.user?.name}</h1>
      {data.user?.area && (
        <Badge tone="warn">{t(data.user.area === "KITCHEN" ? "kitchen" : "floor")}</Badge>
      )}
    </div>
  );

  const Alerts = (
    (c.lowStock || c.pendingDeliveries || c.pendingApprovals || c.overduePrep) ? (
      <Card className="tone-peach border-transparent">
        <h2 className="font-semibold mb-3 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />{t("alerts")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          {c.lowStock > 0 && <Link href="/inventory" className="rounded-xl bg-white/70 p-3 font-medium hover:bg-white transition-colors"><b className="text-lg">{c.lowStock}</b> · {t("lowStock")}</Link>}
          {c.pendingDeliveries > 0 && <Link href="/deliveries" className="rounded-xl bg-white/70 p-3 font-medium hover:bg-white transition-colors"><b className="text-lg">{c.pendingDeliveries}</b> · {t("pendingReports")}</Link>}
          {c.pendingApprovals > 0 && <Link href="/count" className="rounded-xl bg-white/70 p-3 font-medium hover:bg-white transition-colors"><b className="text-lg">{c.pendingApprovals}</b> · {t("pendingApprovals")}</Link>}
          {c.overduePrep > 0 && <Link href="/prep" className="rounded-xl bg-red-50 p-3 font-medium text-red-700 hover:bg-red-100 transition-colors"><b className="text-lg">{c.overduePrep}</b> · {t("overduePrep")}</Link>}
        </div>
      </Card>
    ) : null
  );

  const countStatusText = data.todayCount
    ? data.todayCount.status === "APPROVED" ? t("statusApproved")
      : data.todayCount.status === "SUBMITTED" ? t("statusSubmitted")
      : data.todayCount.status === "REJECTED" ? t("statusRejected") : t("draft")
    : t("notCountedYet");

  // ---------------- EMPLOYEE DASHBOARD ----------------
  if (!data.isManager) {
    return (
      <div className="space-y-6">
        {Greeting}
        {data.counts.overduePrep > 0 && (
          <Card className="border-red-200"><p className="text-red-700 text-sm font-medium">⚠ {data.counts.overduePrep} {t("overduePrep")}</p></Card>
        )}

        <section>
          <h2 className="font-semibold mb-2">{t("quickActions")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <ActionTile href="/count" labelKey="dailyCount" hint={countStatusText} />
            <ActionTile href="/prep" labelKey="prepTasks" hint={`${c.prepTasks}`} />
            <ActionTile href="/deliveries" labelKey="reportReceived" />
            <ActionTile href="/waste" labelKey="wasteReport" />
          </div>
        </section>

        <Card>
          <h2 className="font-semibold mb-1">{t("countStatus")}</h2>
          <p className={data.todayCount ? "text-emerald-700" : "text-amber-700"}>{countStatusText}</p>
        </Card>

        <Card>
          <h2 className="font-semibold mb-2">{t("todaysTasks")} · {t("prepTasks")}</h2>
          {data.prepTasks.length === 0 ? <EmptyState label={t("noData")} /> : (
            <ul className="divide-y divide-gray-100">
              {data.prepTasks.map((tk: any) => (
                <li key={tk.id} className="py-2.5 flex justify-between">
                  <span>{name(tk.prepItem.item)} — {tk.targetQty} {tk.prepItem.item.unit}</span>
                  <Link href="/prep" className="text-brand-600 font-medium">{tk.status}</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold mb-2">{t("pendingReports")}</h2>
          {data.pendingDeliveries.length === 0 ? <EmptyState label={t("noData")} /> : (
            <ul className="divide-y divide-gray-100">
              {data.pendingDeliveries.map((d: any) => (
                <li key={d.id} className="py-2.5 flex justify-between items-center">
                  <span>{d.receivedBy?.name} · {new Date(d.receivedAt).toLocaleDateString()}</span>
                  <Badge tone="warn">{t("statusSubmitted")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  // ---------------- MANAGER / ADMIN DASHBOARD ----------------
  const isAdmin = data.user?.role === "ADMIN";
  return (
    <div className="space-y-6">
      {Greeting}
      {Alerts}

      <section>
        <h2 className="font-semibold mb-2">{t("todaysActions")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <ActionTile href="/count" labelKey="approveCounts" hint={`${c.pendingApprovals}`} />
          <ActionTile href="/deliveries" labelKey="approveReceived" hint={`${c.pendingDeliveries}`} />
          <ActionTile href="/orders" labelKey="orders" hint={`${c.ordersDueToday} ${t("ordersDueToday")}`} />
          <ActionTile href="/prep" labelKey="prepPlanning" hint={`${c.prepTasks}`} />
          <ActionTile href="/inventory" labelKey="lowStock" hint={`${c.lowStock}`} />
          {isAdmin && <ActionTile href="/users" labelKey="users" />}
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label={t("ordersDueToday")} value={c.ordersDueToday} tone={c.ordersDueToday ? "warn" : "default"} />
        <Stat label={t("deliveriesToday")} value={c.deliveriesToday} />
        <Stat label={t("lowStock")} value={c.lowStock} tone={c.lowStock ? "warn" : "ok"} />
        <Stat label={t("critical")} value={c.critical} tone={c.critical ? "danger" : "ok"} />
        <Stat label={t("openOrders")} value={c.openOrders} />
        <Stat label={t("pendingApprovals")} value={c.pendingApprovals} tone={c.pendingApprovals ? "warn" : "default"} />
      </div>

      {data.critical.length > 0 && (
        <Card className="border-red-100">
          <h2 className="font-semibold mb-2 text-red-700">{t("critical")} · {t("lowStock")}</h2>
          <ul className="divide-y divide-gray-100">
            {data.critical.map((i: any) => (
              <li key={i.id} className="py-2.5 flex justify-between">
                <span>{name(i)}</span>
                <span className="text-red-600 font-semibold tabular-nums">{i.currentQty}/{i.minQty} {i.unit}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {data.pendingCounts.length > 0 && (
          <Card>
            <h2 className="font-semibold mb-2">{t("approveCounts")}</h2>
            <ul className="divide-y divide-gray-100">
              {data.pendingCounts.map((p: any) => (
                <li key={p.id} className="py-2.5 flex justify-between">
                  <span>{new Date(p.businessDay).toLocaleDateString()} · {p.countedBy?.name}</span>
                  <Link href="/count" className="text-brand-600 font-medium">{t("review")}</Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {data.pendingDeliveries.length > 0 && (
          <Card>
            <h2 className="font-semibold mb-2">{t("approveReceived")}</h2>
            <ul className="divide-y divide-gray-100">
              {data.pendingDeliveries.map((d: any) => (
                <li key={d.id} className="py-2.5 flex justify-between">
                  <span>{d.receivedBy?.name} · {new Date(d.receivedAt).toLocaleDateString()}</span>
                  <Link href="/deliveries" className="text-brand-600 font-medium">{t("review")}</Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
