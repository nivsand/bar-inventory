"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Spinner } from "@/components/ui";
import { CountDetailModal } from "@/components/CountDetailModal";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

// Self-contained Inventory Count History: chronological list with filters
// (status / employee / date) and a full detail+review modal. Always fetches
// fresh from the server.
export function CountHistory() {
  const { t, name } = useI18n();
  const { data: session } = useSession();
  const isManager = ["MANAGER", "ADMIN"].includes((session?.user as any)?.role);

  const [counts, setCounts] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [f, setF] = useState({ status: "", employeeId: "", from: "", to: "" });

  function load() {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any).toString();
    setCounts(null);
    api(`/api/counts${qs ? `?${qs}` : ""}`).then(setCounts).catch(() => setCounts([]));
  }
  useEffect(() => { load(); api("/api/users").then(setUsers).catch(() => {}); /* eslint-disable-next-line */ }, []);

  async function openDetail(id: string) {
    setDetail("loading");
    try { setDetail(await api(`/api/counts/${id}`)); } catch { setDetail(null); }
  }
  async function action(id: string, a: "APPROVE" | "RECOUNT" | "REJECT") {
    await api(`/api/counts/${id}/approve`, { method: "POST", body: JSON.stringify({ action: a }) });
    setDetail(null); load();
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select className="touch-input h-11 text-sm" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">{t("status")}: {t("all")}</option>
            {["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="touch-input h-11 text-sm" value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
            <option value="">{t("employee")}: {t("all")}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <input type="date" className="touch-input h-11 text-sm" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label={t("fromDate")} />
          <input type="date" className="touch-input h-11 text-sm" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label={t("toDate")} />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary text-sm" onClick={load}>{t("filter")}</button>
          <button className="btn-ghost text-sm" onClick={() => { setF({ status: "", employeeId: "", from: "", to: "" }); setTimeout(load, 0); }}>{t("clearFilters")}</button>
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        {counts === null ? <div className="flex justify-center py-12"><Spinner /></div> : counts.length === 0 ? (
          <p className="p-4 text-gray-400">{t("noData")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500"><tr>
              <th className="text-start p-3 whitespace-nowrap">{t("date")}</th>
              <th className="text-start p-3">{t("employee")}</th>
              <th className="p-3">{t("location")}</th>
              <th className="p-3">{t("item")}</th>
              <th className="p-3">{t("status")}</th>
              <th className="p-3"></th>
            </tr></thead>
            <tbody>{counts.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3 whitespace-nowrap">{new Date(c.submittedAt || c.businessDay).toLocaleString()}</td>
                <td className="p-3">{c.countedBy?.name}</td>
                <td className="p-3 text-center text-gray-500">{c.location ? name(c.location) : t("fullCount")}</td>
                <td className="p-3 text-center text-gray-500">{c._count?.entries}</td>
                <td className="p-3 text-center"><span className={`badge ${STATUS_TONE[c.status] || "bg-gray-100"}`}>{c.status}</span></td>
                <td className="p-3 text-end"><button className="text-brand-600" onClick={() => openDetail(c.id)}>{t("viewDetails")}</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      <CountDetailModal detail={detail} isManager={isManager} onAction={action} onClose={() => setDetail(null)} />
    </div>
  );
}
