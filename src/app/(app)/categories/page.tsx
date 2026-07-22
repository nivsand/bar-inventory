"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { api } from "@/lib/fetcher";
import { Card, Field, Input, PageSpinner, EmptyState, Badge } from "@/components/ui";
import { Plus, Pencil, Trash2 } from "lucide-react";

const blank = { nameHe: "", nameEn: "", kind: "RAW", sortOrder: 0 };

export default function CategoriesPage() {
  const { t, name } = useI18n();
  const [cats, setCats] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => api("/api/categories").then((d) => { setCats(d); setLoading(false); });
  useEffect(() => { load(); }, []);

  async function save() {
    const body = { nameHe: editing.nameHe, nameEn: editing.nameEn, kind: editing.kind, sortOrder: Number(editing.sortOrder) || 0 };
    if (editing.id) await api(`/api/categories/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
    else await api("/api/categories", { method: "POST", body: JSON.stringify(body) });
    setEditing(null); load();
  }
  async function remove(id: string) {
    if (!window.confirm(t("confirmArchiveItem"))) return;
    await api(`/api/categories/${id}`, { method: "DELETE" }); load();
  }

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("categories")}</h1>
        <button className="btn-primary" onClick={() => setEditing({ ...blank })}><Plus className="h-4 w-4" />{t("add")}</button>
      </div>

      <Card className="p-0 overflow-hidden">
        {cats.length === 0 ? <EmptyState label={t("noData")} /> : (
        <table className="w-full text-sm">
          <thead className="text-gray-500"><tr>
            <th className="text-start p-3.5 text-xs font-semibold uppercase tracking-wide">{t("category")}</th>
            <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">Kind</th>
            <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">{t("sortOrder")}</th><th className="p-3.5"></th>
          </tr></thead>
          <tbody>{cats.map((c) => (
            <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="p-3.5 font-medium text-gray-900">{name(c)} <span className="text-gray-400 text-xs font-normal">({c.nameHe} / {c.nameEn})</span></td>
              <td className="p-3.5 text-center"><Badge tone="neutral">{c.kind}</Badge></td>
              <td className="p-3.5 text-center text-gray-500 tabular-nums">{c.sortOrder}</td>
              <td className="p-3.5">
                <div className="flex gap-3 justify-end">
                  <button className="text-brand-700 font-medium inline-flex items-center gap-1" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" />{t("edit")}</button>
                  <button className="text-red-600 font-medium inline-flex items-center gap-1" onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5" />{t("delete")}</button>
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
            <h2 className="text-xl font-bold text-gray-900">{editing.id ? t("edit") : t("add")} {t("category")}</h2>
            <Field label="שם עברית"><Input value={editing.nameHe} onChange={(e) => setEditing({ ...editing, nameHe: e.target.value })} /></Field>
            <Field label="Name (EN)"><Input value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind">
                <select className="touch-input" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                  <option value="RAW">RAW</option><option value="PREP">PREP</option>
                </select>
              </Field>
              <Field label={t("sortOrder")}><Input type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} /></Field>
            </div>
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
