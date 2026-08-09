"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { invalidateApiCache } from "@/lib/client-cache";
import { Card, Input, Field, SearchInput, PageSpinner, EmptyState } from "@/components/ui";
import { fmtDays } from "@/lib/format";
import { Plus, Pencil, Package, CalendarClock, Truck as TruckIcon, Wallet } from "lucide-react";

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
      minOrderAmount: editing.minOrderAmount === "" || editing.minOrderAmount == null ? null : Number(editing.minOrderAmount) };
    if (editing.id) await api(`/api/suppliers/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
    else await api("/api/suppliers", { method: "POST", body: JSON.stringify(body) });
    invalidateApiCache(["/api/suppliers", "/api/inventory", "/api/orders", "/api/orders/suggestions"]);
    setEditing(null); load();
  }

  async function remove(id: string) {
    if (!window.confirm(t("confirmArchiveSupplier"))) return;
    await api(`/api/suppliers/${id}`, { method: "DELETE" });
    invalidateApiCache(["/api/suppliers", "/api/inventory", "/api/orders", "/api/orders/suggestions"]);
    setEditing(null); load(); if (showArchived) loadArchived();
  }

  async function restore(id: string) {
    await api(`/api/suppliers/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: true, deletedAt: null, deletedById: null }) });
    invalidateApiCache(["/api/suppliers", "/api/inventory", "/api/orders", "/api/orders/suggestions"]);
    loadArchived(); load();
  }

  function toggleSel(id: string) { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); }
  async function bulkArchive() {
    if (!window.confirm(t("confirmArchiveSupplier"))) return;
    await api("/api/suppliers/bulk", { method: "POST", body: JSON.stringify({ action: "archive", ids: [...sel] }) });
    invalidateApiCache(["/api/suppliers", "/api/inventory", "/api/orders", "/api/orders/suggestions"]);
    setSel(new Set()); load(); if (showArchived) loadArchived();
  }

  if (loading) return <PageSpinner />;
  const wdLabel = (d: number) => fmtDays([d], locale);
  const shown = sups.filter((s) => !search || name(s).toLowerCase().includes(search.toLowerCase()) || s.nameHe.includes(search) || s.nameEn.toLowerCase().includes(search.toLowerCase()) || (s.contactPerson || "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{t("suppliers")}</h1>
        <div className="flex gap-2">
          {isAdmin && <button className="btn-ghost text-sm" onClick={toggleArchived}>{showArchived ? t("hideArchived") : t("viewArchived")}</button>}
          <button className="btn-primary" onClick={() => setEditing({ ...blank })}><Plus className="h-4 w-4" />{t("add")}</button>
        </div>
      </div>

      {isAdmin && showArchived && (
        <Card className="tone-peach border-transparent">
          <div className="text-sm font-semibold mb-2">{t("archived")}</div>
          {archived.length === 0 ? <EmptyState label={t("noData")} /> : (
            <ul className="divide-y divide-black/5">
              {archived.map((s) => (
                <li key={s.id} className="py-2 flex justify-between">
                  <span>{name(s)} <span className="text-xs opacity-70">{s.deletedAt ? new Date(s.deletedAt).toLocaleDateString() : ""}</span></span>
                  <button className="font-medium" onClick={() => restore(s.id)}>{t("restore")}</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <SearchInput placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />

      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl p-2.5 shadow-card">
          <span className="text-sm font-medium">{sel.size} {t("selected")}</span>
          <button className="btn-danger text-xs" onClick={bulkArchive}>{t("bulkArchive")}</button>
          <button className="btn-ghost text-xs" onClick={() => setSel(new Set())}>{t("cancel")}</button>
        </div>
      )}

      {shown.length === 0 && <Card><EmptyState label={t("noData")} /></Card>}
      <div className="grid md:grid-cols-2 gap-3">
        {shown.map((s) => (
          <Card key={s.id} className="hover:shadow-card-hover transition-shadow duration-200">
            <div className="flex justify-between items-start gap-2">
              <div className="flex gap-2.5">
                <input type="checkbox" className="mt-1.5" checked={sel.has(s.id)} onChange={() => toggleSel(s.id)} />
                <div>
                  <h3 className="font-semibold text-gray-900">{name(s)}</h3>
                  <p className="text-sm text-gray-500">{s.contactPerson} {s.phone && `· ${s.phone}`}</p>
                  {s.email && <p className="text-xs text-gray-400 mt-0.5">{s.email} {s.whatsapp && `· wa ${s.whatsapp}`}</p>}
                </div>
              </div>
              <button className="text-brand-700 text-sm font-medium inline-flex items-center gap-1" onClick={() => setEditing(s)}><Pencil className="h-3.5 w-3.5" />{t("edit")}</button>
            </div>
            <div className="text-sm text-gray-600 mt-3 space-y-1.5">
              <div className="flex items-center gap-2"><Package className="h-3.5 w-3.5 text-gray-400 flex-none" />{s.orderingMethod} {s.orderCutoffTime && `· ${s.orderCutoffTime}`}</div>
              <div className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5 text-gray-400 flex-none" />{t("orders")}: {fmtDays(s.orderDeadlineDays, locale) || "—"}</div>
              <div className="flex items-center gap-2"><TruckIcon className="h-3.5 w-3.5 text-gray-400 flex-none" />{t("deliveries")}: {fmtDays(s.deliveryDays, locale) || "—"}</div>
              <div className="flex items-center gap-2"><Wallet className="h-3.5 w-3.5 text-gray-400 flex-none" />{t("minimumOrderAmount")}: {s.minOrderAmount ?? "—"}{s.minOrderNote ? ` · ${s.minOrderNote}` : ""}</div>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900">{editing.id ? t("edit") : t("add")} {t("supplier")}</h2>
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
              <Field label={t("minimumOrderAmount")}><Input type="number" value={editing.minOrderAmount ?? ""} onChange={(e) => setEditing({ ...editing, minOrderAmount: e.target.value })} /></Field>
              <Field label="Min order note"><Input value={editing.minOrderNote || ""} onChange={(e) => setEditing({ ...editing, minOrderNote: e.target.value })} /></Field>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600">Order deadline days</span>
              <div className="flex gap-1.5 mt-1.5">{WD.map((d) => (
                <button key={d} onClick={() => toggleDay("orderDeadlineDays", d)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150 ${(editing.orderDeadlineDays||[]).includes(d) ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{wdLabel(d)}</button>))}</div>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-600">Delivery days</span>
              <div className="flex gap-1.5 mt-1.5">{WD.map((d) => (
                <button key={d} onClick={() => toggleDay("deliveryDays", d)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150 ${(editing.deliveryDays||[]).includes(d) ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{wdLabel(d)}</button>))}</div>
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
