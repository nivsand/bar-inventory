"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Field, Input, PageSpinner, EmptyState } from "@/components/ui";
import { Trash2 } from "lucide-react";

const REASONS = ["SPOILED", "EXPIRED", "DAMAGED", "PREP_MISTAKE", "OVER_PRODUCTION", "OTHER"];

export default function WastePage() {
  const { t, name } = useI18n();
  const { data: session } = useSession();
  const isManager = ["MANAGER", "ADMIN"].includes((session?.user as any)?.role);
  const [items, setItems] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [form, setForm] = useState({ itemId: "", qty: "", reason: "SPOILED", note: "" });
  const load = () => api("/api/waste").then(setEntries);
  useEffect(() => { api("/api/inventory").then(setItems); load(); }, []);

  async function submit() {
    const item = items.find((i) => i.id === form.itemId); if (!item) return;
    await api("/api/waste", { method: "POST", body: JSON.stringify({ itemId: form.itemId, qty: Number(form.qty), unit: item.unit, reason: form.reason, note: form.note }) });
    setForm({ itemId: "", qty: "", reason: "SPOILED", note: "" }); load();
  }

  async function remove(id: string) {
    if (!window.confirm(t("confirmDelete"))) return;
    await api(`/api/waste/${id}`, { method: "DELETE" });
    load();
  }

  if (!items.length) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t("waste")}</h1>
      <Card className="space-y-3">
        <h2 className="font-semibold">{t("wasteReport")}</h2>
        <Field label={t("item")}>
          <select className="touch-input" value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })}>
            <option value="">—</option>{items.map((i) => <option key={i.id} value={i.id}>{name(i)} ({i.unit})</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("quantity")}><Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></Field>
          <Field label={t("reason")}>
            <select className="touch-input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t("notes")}><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        <button className="btn-primary w-full" disabled={!form.itemId || !form.qty} onClick={submit}>{t("submit")}</button>
      </Card>

      <Card className="p-0 overflow-hidden">
        {entries.length === 0 ? <EmptyState label={t("noData")} /> : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500"><tr>
            <th className="text-start p-3.5 text-xs font-semibold uppercase tracking-wide">{t("item")}</th>
            <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">{t("quantity")}</th>
            <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">{t("reason")}</th>
            <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">{t("employee")}</th>
            <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">{t("date")}</th>{isManager && <th className="p-3.5"></th>}
          </tr></thead>
          <tbody>{entries.map((e) => (
            <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="p-3.5 font-medium text-gray-900">{name(e.item)}</td><td className="p-3.5 text-center tabular-nums">{e.qty} {e.unit}</td>
              <td className="p-3.5 text-center">{e.reason}</td><td className="p-3.5">{e.user?.name}</td>
              <td className="p-3.5 text-gray-400">{new Date(e.createdAt).toLocaleDateString()}</td>
              {isManager && <td className="p-3.5 text-center"><button className="text-red-600 font-medium inline-flex items-center gap-1" onClick={() => remove(e.id)} aria-label={t("delete")}><Trash2 className="h-3.5 w-3.5" />{t("delete")}</button></td>}
            </tr>
          ))}</tbody>
        </table>
        </div>
        )}
      </Card>
    </div>
  );
}
