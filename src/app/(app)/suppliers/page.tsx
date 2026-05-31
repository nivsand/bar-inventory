"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Input, Field, Spinner } from "@/components/ui";
import { fmtDays } from "@/lib/format";

const WD = [0,1,2,3,4,5,6];
const blank = { nameHe: "", nameEn: "", contactPerson: "", phone: "", whatsapp: "", email: "",
  orderingMethod: "WHATSAPP", orderDeadlineDays: [], orderCutoffTime: "", deliveryDays: [], leadTimeDays: 1,
  minOrderAmount: null, minOrderNote: "", notes: "" };

export default function SuppliersPage() {
  const { t, name, locale } = useI18n();
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const [sups, setSups] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const load = () => api("/api/suppliers").then((d) => { setSups(d); setLoading(false); });
  const loadArchived = () => api("/api/suppliers?archived=1").then(setArchived);
  useEffect(() => { load(); }, []);

  function toggleArchived() { const n = !showArchived; setShowArchived(n); if (n) loadArchived(); }

  function toggleDay(field: string, d: number) {
    const arr = new Set<number>(editing[field] || []);
    arr.has(d) ? arr.delete(d) : arr.add(d);
    setEditing({ ...editing, [field]: [...arr].sort() });
  }

  async function save() {
    const body = { ...editing, leadTimeDays: Number(editing.leadTimeDays),
      minOrderAmount: editing.minOrderAmount ? Number(editing.minOrderAmount) : null };
    if (editing.id) await api(`/api/suppliers/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
    else await api("/api/suppliers", { method: "POST", body: JSON.stringify(body) });
    setEditing(null); load();
  }

  async function remove(id: string) {
    if (!window.confirm(t("confirmArchiveSupplier"))) return;
    await api(`/api/suppliers/${id}`, { method: "DELETE" });
    setEditing(null); load(); if (showArchived) loadArchived();
  }

  async function restore(id: string) {
    await api(`/api/suppliers/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: true, deletedAt: null, deletedById: null }) });
    loadArchived(); load();
  }

  function toggleSel(id: string) { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); }
  async function bulkArchive() {
    if (!window.confirm(t("confirmArchiveSupplier"))) return;
    await api("/api/suppliers/bulk", { method: "POST", body: JSON.stringify({ action: "archive", ids: [...sel] }) });
    setSel(new Set()); load(); if (showArchived) loadArchived();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  const wdLabel = (d: number) => fmtDays([d], locale);
  const shown = sups.filter((s) => !search || name(s).toLowerCase().includes(search.toLowerCase()) || s.nameHe.includes(search) || s.nameEn.toLowerCase().includes(search.toLowerCase()) || (s.contactPerson || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("suppliers")}</h1>
        <div className="flex gap-2">
          {isAdmin && <button className="btn-ghost text-sm" onClick={toggleArchived}>{showArchived ? t("hideArchived") : t("viewArchived")}</button>}
          <button className="btn-primary" onClick={() => setEditing({ ...blank })}>+ {t("add")}</button>
        </div>
      </div>

      {isAdmin && showArchived && (
        <Card className="border-amber-200">
          <div className="text-amber-800 text-sm font-medium mb-2">{t("archived")}</div>
          {archived.length === 0 ? <p className="text-gray-400 text-sm">{t("noData")}</p> : (
            <ul className="divide-y">
              {archived.map((s) => (
                <li key={s.id} className="py-2 flex justify-between">
                  <span>{name(s)} <span className="text-gray-400 text-xs">{s.deletedAt ? new Date(s.deletedAt).toLocaleDateString() : ""}</span></span>
                  <button className="text-brand-600" onClick={() => restore(s.id)}>{t("restore")}</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />

      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl p-2">
          <span className="text-sm font-medium">{sel.size} {t("selected")}</span>
          <button className="btn-danger text-xs" onClick={bulkArchive}>{t("bulkArchive")}</button>
          <button className="btn-ghost text-xs" onClick={() => setSel(new Set())}>{t("cancel")}</button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {shown.map((s) => (
          <Card key={s.id}>
            <div className="flex justify-between items-start gap-2">
              <div className="flex gap-2">
                <input type="checkbox" className="mt-1.5" checked={sel.has(s.id)} onChange={() => toggleSel(s.id)} />
                <div>
                  <h3 className="font-semibold">{name(s)}</h3>
                  <p className="text-sm text-gray-500">{s.contactPerson} {s.phone && `· ${s.phone}`}</p>
                  {s.email && <p className="text-xs text-gray-400">✉ {s.email} {s.whatsapp && `· wa ${s.whatsapp}`}</p>}
                </div>
              </div>
              <button className="text-brand-600 text-sm" onClick={() => setEditing(s)}>{t("edit")}</button>
            </div>
            <div className="text-sm text-gray-600 mt-2 space-y-1">
              <div>📦 {s.orderingMethod} {s.orderCutoffTime && `· ${s.orderCutoffTime}`}</div>
              <div>🗓 {t("orders")}: {fmtDays(s.orderDeadlineDays, locale) || "—"}</div>
              <div>🚚 {t("deliveries")}: {fmtDays(s.deliveryDays, locale) || "—"}</div>
              {s.minOrderNote && <div>💰 {s.minOrderNote}</div>}
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-30" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{editing.id ? t("edit") : t("add")} {t("supplier")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="שם עברית"><Input value={editing.nameHe} onChange={(e) => setEditing({ ...editing, nameHe: e.target.value })} /></Field>
              <Field label="Name (EN)"><Input value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} /></Field>
              <Field label="Contact"><Input value={editing.contactPerson || ""} onChange={(e) => setEditing({ ...editing, contactPerson: e.target.value })} /></Field>
              <Field label="Phone"><Input value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="WhatsApp"><Input value={editing.whatsapp || ""} onChange={(e) => setEditing({ ...editing, whatsapp: e.target.value })} /></Field>
              <Field label="Email"><Input value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
              <Field label="Method">
                <select className="touch-input" value={editing.orderingMethod} onChange={(e) => setEditing({ ...editing, orderingMethod: e.target.value })}>
                  {["WHATSAPP","EMAIL","PHONE","APP","OTHER"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Cutoff time"><Input value={editing.orderCutoffTime || ""} placeholder="20:00" onChange={(e) => setEditing({ ...editing, orderCutoffTime: e.target.value })} /></Field>
              <Field label="Lead time (days)"><Input type="number" value={editing.leadTimeDays} onChange={(e) => setEditing({ ...editing, leadTimeDays: e.target.value })} /></Field>
              <Field label="Min order note"><Input value={editing.minOrderNote || ""} onChange={(e) => setEditing({ ...editing, minOrderNote: e.target.value })} /></Field>
            </div>
            <div>
              <span className="text-sm text-gray-600">Order deadline days</span>
              <div className="flex gap-1 mt-1">{WD.map((d) => (
                <button key={d} onClick={() => toggleDay("orderDeadlineDays", d)}
                  className={`badge px-3 py-1.5 ${(editing.orderDeadlineDays||[]).includes(d) ? "bg-brand-600 text-white" : "bg-gray-100"}`}>{wdLabel(d)}</button>))}</div>
            </div>
            <div>
              <span className="text-sm text-gray-600">Delivery days</span>
              <div className="flex gap-1 mt-1">{WD.map((d) => (
                <button key={d} onClick={() => toggleDay("deliveryDays", d)}
                  className={`badge px-3 py-1.5 ${(editing.deliveryDays||[]).includes(d) ? "bg-emerald-600 text-white" : "bg-gray-100"}`}>{wdLabel(d)}</button>))}</div>
            </div>
            <Field label={t("notes")}><Input value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={save}>{t("save")}</button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>{t("cancel")}</button>
            </div>
            {editing.id && (
              <button className="btn-danger w-full mt-1" onClick={() => remove(editing.id)}>{t("delete")}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
