"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { api } from "@/lib/fetcher";
import { Card, Field, Input, Spinner } from "@/components/ui";

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
    setEditing(null); load();
  }
  async function remove(id: string) {
    if (!window.confirm(t("confirmArchiveItem"))) return;
    await api(`/api/locations/${id}`, { method: "DELETE" }); load();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("locations")}</h1>
        <button className="btn-primary" onClick={() => setEditing({ ...blank })}>+ {t("add")}</button>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500"><tr>
            <th className="text-start p-3">{t("location")}</th><th className="p-3">{t("sortOrder")}</th><th className="p-3"></th>
          </tr></thead>
          <tbody>{locs.map((l) => (
            <tr key={l.id} className="border-t">
              <td className="p-3">{name(l)} <span className="text-gray-400 text-xs">({l.nameHe} / {l.nameEn})</span></td>
              <td className="p-3 text-center text-gray-500">{l.sortOrder}</td>
              <td className="p-3">
                <div className="flex gap-3 justify-end">
                  <button className="text-brand-600" onClick={() => setEditing(l)}>{t("edit")}</button>
                  <button className="text-red-600" onClick={() => remove(l.id)}>{t("delete")}</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-30" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{editing.id ? t("edit") : t("add")} {t("location")}</h2>
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
