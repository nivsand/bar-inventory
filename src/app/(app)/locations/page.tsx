"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { api } from "@/lib/fetcher";
import { invalidateApiCache } from "@/lib/client-cache";
import { Card, Field, Input, PageSpinner, EmptyState } from "@/components/ui";
import { Plus, Pencil, Trash2 } from "lucide-react";

const blank = { nameHe: "", nameEn: "", sortOrder: 0 };

export default function LocationsPage() {
  const { t, name } = useI18n();
  const [locs, setLocs] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => api("/api/locations").then((d) => { setLocs(d); setLoading(false); });
  useEffect(() => { load(); }, []);

  async function save() {
    const body = { nameHe: editing.nameHe, nameEn: editing.nameEn, sortOrder: Number(editing.sortOrder) || 0 };
    if (editing.id) await api(`/api/locations/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
    else await api("/api/locations", { method: "POST", body: JSON.stringify(body) });
    invalidateApiCache(["/api/locations", "/api/inventory", "/api/counts"]);
    setEditing(null); load();
  }
  async function remove(id: string) {
    if (!window.confirm(t("confirmArchiveItem"))) return;
    await api(`/api/locations/${id}`, { method: "DELETE" });
    invalidateApiCache(["/api/locations", "/api/inventory", "/api/counts"]);
    load();
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("locations")}</h1>
        <button className="btn-primary" onClick={() => setEditing({ ...blank })}><Plus className="h-4 w-4" />{t("add")}</button>
      </div>

      <Card className="p-0 overflow-hidden">
        {locs.length === 0 ? <EmptyState label={t("noData")} /> : (
        <table className="w-full text-sm">
          <thead className="text-gray-500"><tr>
            <th className="text-start p-3.5 text-xs font-semibold uppercase tracking-wide">{t("location")}</th>
            <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">{t("sortOrder")}</th><th className="p-3.5"></th>
          </tr></thead>
          <tbody>{locs.map((l) => (
            <tr key={l.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="p-3.5 font-medium text-gray-900">{name(l)} <span className="text-gray-400 text-xs font-normal">({l.nameHe} / {l.nameEn})</span></td>
              <td className="p-3.5 text-center text-gray-500 tabular-nums">{l.sortOrder}</td>
              <td className="p-3.5">
                <div className="flex gap-3 justify-end">
                  <button className="text-brand-700 font-medium inline-flex items-center gap-1" onClick={() => setEditing(l)}><Pencil className="h-3.5 w-3.5" />{t("edit")}</button>
                  <button className="text-red-600 font-medium inline-flex items-center gap-1" onClick={() => remove(l.id)}><Trash2 className="h-3.5 w-3.5" />{t("delete")}</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
        )}
      </Card>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900">{editing.id ? t("edit") : t("add")} {t("location")}</h2>
            <Field label="שם עברית"><Input value={editing.nameHe} onChange={(e) => setEditing({ ...editing, nameHe: e.target.value })} /></Field>
            <Field label="Name (EN)"><Input value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} /></Field>
            <Field label={t("sortOrder")}><Input type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} /></Field>
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={save} disabled={!editing.nameHe || !editing.nameEn}>{t("save")}</button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
