"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { api } from "@/lib/fetcher";
import { Card, Spinner, Badge, EmptyState } from "@/components/ui";
import { Filter, RotateCcw } from "lucide-react";

const ACTION_TONE: Record<string, "ok" | "info" | "danger"> = {
  CREATE: "ok",
  UPDATE: "info",
  DELETE: "danger",
};

export default function AuditPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<any[] | null>(null);
  const [entities, setEntities] = useState<string[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [f, setF] = useState({ userId: "", action: "", entity: "", from: "", to: "" });

  function load() {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any).toString();
    setLogs(null);
    api(`/api/audit${qs ? `?${qs}` : ""}`).then((d) => { setLogs(d.logs); setEntities(d.entities); });
  }
  useEffect(() => { load(); api("/api/users").then(setUsers).catch(() => {}); /* eslint-disable-next-line */ }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t("audit")}</h1>

      <Card className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select className="touch-input h-11 text-sm" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
            <option value="">{t("user")}: {t("all")}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="touch-input h-11 text-sm" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>
            <option value="">{t("action")}: {t("all")}</option>
            {["CREATE", "UPDATE", "DELETE"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="touch-input h-11 text-sm" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}>
            <option value="">{t("entity")}: {t("all")}</option>
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <input type="date" className="touch-input h-11 text-sm" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label={t("fromDate")} />
          <input type="date" className="touch-input h-11 text-sm" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label={t("toDate")} />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary text-sm" onClick={load}><Filter className="h-4 w-4" />{t("filter")}</button>
          <button className="btn-ghost text-sm" onClick={() => { setF({ userId: "", action: "", entity: "", from: "", to: "" }); setTimeout(load, 0); }}><RotateCcw className="h-4 w-4" />{t("clearFilters")}</button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {logs === null ? <div className="flex justify-center py-12"><Spinner /></div> : logs.length === 0 ? (
          <EmptyState label={t("noData")} />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500"><tr>
              <th className="text-start p-3.5 whitespace-nowrap text-xs font-semibold uppercase tracking-wide">{t("date")}</th>
              <th className="text-start p-3.5 text-xs font-semibold uppercase tracking-wide">{t("user")}</th>
              <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">{t("action")}</th>
              <th className="text-start p-3.5 text-xs font-semibold uppercase tracking-wide">{t("entity")}</th>
              <th className="text-start p-3.5 text-xs font-semibold uppercase tracking-wide">{t("notes")}</th>
            </tr></thead>
            <tbody>{logs.map((l) => (
              <tr key={l.id} className="border-t border-gray-100 align-top hover:bg-gray-50 transition-colors">
                <td className="p-3.5 text-gray-400 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="p-3.5 font-medium text-gray-900">{l.user?.name || "—"}</td>
                <td className="p-3.5 text-center"><Badge tone={ACTION_TONE[l.action] ?? "neutral"}>{l.action}</Badge></td>
                <td className="p-3.5">{l.entity}</td>
                <td className="p-3.5 text-gray-600">{l.field ? `${l.field}: ${l.oldValue ?? "—"} → ${l.newValue ?? "—"}` : ""}</td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
