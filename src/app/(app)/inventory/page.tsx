"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Input, Field, Spinner } from "@/components/ui";

const blank = { nameHe: "", nameEn: "", unit: "kg", kind: "RAW", area: "KITCHEN", inCount: true,
  categoryId: "", supplierId: "", currentQty: 0, minQty: 0, parQty: 0, avgDailyUsage: 0,
  orderUnitNameHe: "", orderUnitNameEn: "", unitsPerOrderUnit: "", notes: "" };

export default function InventoryPage() {
  const { t, name } = useI18n();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const isManager = ["MANAGER", "ADMIN"].includes(role);
  const isAdmin = role === "ADMIN";
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [sups, setSups] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [areaTab, setAreaTab] = useState<"KITCHEN" | "FLOOR">("KITCHEN");
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selArch, setSelArch] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState("");

  const load = () => api("/api/inventory").then((d) => { setItems(d); setLoading(false); });
  const loadArchived = () => api("/api/inventory?archived=1").then(setArchived);
  useEffect(() => { load(); api("/api/categories").then(setCats); api("/api/suppliers").then(setSups); }, []);

  function toggleArchived() { const n = !showArchived; setShowArchived(n); if (n) loadArchived(); }

  async function save() {
    const body = { ...editing,
      currentQty: Number(editing.currentQty), minQty: Number(editing.minQty), parQty: Number(editing.parQty),
      avgDailyUsage: Number(editing.avgDailyUsage),
      unitsPerOrderUnit: editing.unitsPerOrderUnit === "" || editing.unitsPerOrderUnit == null ? null : Number(editing.unitsPerOrderUnit),
      orderUnitNameHe: editing.orderUnitNameHe || null, orderUnitNameEn: editing.orderUnitNameEn || null,
      categoryId: editing.categoryId || null, supplierId: editing.supplierId || null };
    if (editing.id) await api(`/api/inventory/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
    else await api("/api/inventory", { method: "POST", body: JSON.stringify(body) });
    setEditing(null); load();
  }

  async function remove(id: string) {
    if (!window.confirm(t("confirmArchiveItem"))) return;
    await api(`/api/inventory/${id}`, { method: "DELETE" });
    setEditing(null); load(); if (showArchived) loadArchived();
  }

  async function restore(id: string) {
    await api(`/api/inventory/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: true, deletedAt: null, deletedById: null }) });
    loadArchived(); load();
  }

  async function permanentDelete(id: string) {
    if (!window.confirm(t("confirmPermanentDelete"))) return;
    try { await api(`/api/inventory/${id}?hard=1`, { method: "DELETE" }); loadArchived(); }
    catch (e: any) { alert(e.message); }
  }

  function toggleSel(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n);
  }

  async function bulkArchive() {
    if (!window.confirm(t("confirmArchiveItem"))) return;
    await api("/api/inventory/bulk", { method: "POST", body: JSON.stringify({ action: "archive", ids: [...sel] }) });
    setSel(new Set()); load(); if (showArchived) loadArchived();
  }
  async function bulkAssignCategory() {
    await api("/api/inventory/bulk", { method: "POST", body: JSON.stringify({ action: "category", ids: [...sel], categoryId: bulkCat || null }) });
    setSel(new Set()); setBulkCat(""); load();
  }
  async function bulkRestore() {
    await api("/api/inventory/bulk", { method: "POST", body: JSON.stringify({ action: "restore", ids: [...selArch] }) });
    setSelArch(new Set()); loadArchived(); load();
  }
  async function bulkPermanentDelete() {
    if (!window.confirm(t("confirmPermanentDelete"))) return;
    try {
      const res = await api("/api/inventory/bulk", { method: "POST", body: JSON.stringify({ action: "permanentDelete", ids: [...selArch] }) });
      let msg = `${t("deleted")}: ${res.deletedCount}`;
      if (res.failedCount > 0) {
        msg += `\n${t("failed")}: ${res.failedCount}\n` +
          res.failed.map((f: any) => `• ${f.nameEn} — ${f.reason}`).join("\n");
      }
      alert(msg);
      setSelArch(new Set()); loadArchived(); load();
    } catch (e: any) { alert(e.message); }
  }

  const filtered = items.filter((i) =>
    (i.area || "KITCHEN") === areaTab &&
    (name(i).toLowerCase().includes(search.toLowerCase()) || i.nameHe.includes(search) || i.nameEn.toLowerCase().includes(search.toLowerCase())));

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("inventory")}</h1>
        <div className="flex gap-2">
          {isAdmin && <button className="btn-ghost text-sm" onClick={toggleArchived}>{showArchived ? t("hideArchived") : t("viewArchived")}</button>}
          {isManager && <button className="btn-primary" onClick={() => setEditing({ ...blank })}>+ {t("add")}</button>}
        </div>
      </div>
      <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />

      {/* Separate inventory by area */}
      <div className="inline-flex rounded-xl bg-gray-100 p-1">
        {(["KITCHEN", "FLOOR"] as const).map((a) => (
          <button key={a} onClick={() => setAreaTab(a)}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium ${areaTab === a ? "bg-white shadow text-brand-700" : "text-gray-500"}`}>
            {t(a === "KITCHEN" ? "kitchen" : "floor")}
          </button>
        ))}
      </div>

      {isAdmin && showArchived && (
        <Card className="p-0 overflow-x-auto border-amber-200">
          <div className="px-3 py-2 bg-amber-50 text-amber-800 text-sm font-medium flex flex-wrap justify-between items-center gap-2">
            <span>{t("archived")}</span>
            {selArch.size > 0 && (
              <span className="flex gap-2 flex-wrap">
                <button className="btn-primary text-xs" onClick={bulkRestore}>{t("bulkRestore")} ({selArch.size})</button>
                <button className="btn-danger text-xs" onClick={bulkPermanentDelete}>{t("bulkPermanentDelete")} ({selArch.size})</button>
              </span>
            )}
          </div>
          <table className="w-full text-sm">
            <tbody>
              {archived.length === 0 && <tr><td className="p-3 text-gray-400">{t("noData")}</td></tr>}
              {archived.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="p-3 w-8"><input type="checkbox" checked={selArch.has(i.id)} onChange={() => toggleSel(selArch, setSelArch, i.id)} /></td>
                  <td className="p-3">{name(i)}</td>
                  <td className="p-3 text-gray-400">{i.deletedAt ? new Date(i.deletedAt).toLocaleDateString() : ""}</td>
                  <td className="p-3 text-end">
                    <div className="flex gap-3 justify-end">
                      <button className="text-brand-600" onClick={() => restore(i.id)}>{t("restore")}</button>
                      <button className="text-red-600" onClick={() => permanentDelete(i.id)}>{t("permanentDelete")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {isManager && sel.size > 0 && (
        <div className="sticky top-28 z-10 flex flex-wrap items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl p-2">
          <span className="text-sm font-medium">{sel.size} {t("selected")}</span>
          <button className="btn-danger text-xs" onClick={bulkArchive}>{t("bulkArchive")}</button>
          <select className="touch-input h-9 w-auto text-sm" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
            <option value="">{t("assignCategory")}…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
          </select>
          <button className="btn-ghost text-xs" disabled={!bulkCat} onClick={bulkAssignCategory}>{t("save")}</button>
          <button className="btn-ghost text-xs" onClick={() => setSel(new Set())}>{t("cancel")}</button>
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500"><tr>
            {isManager && <th className="p-3 w-8"></th>}
            <th className="text-start p-3">{t("item")}</th><th className="p-3">{t("current")}</th>
            <th className="p-3">{t("min")}</th><th className="p-3">{t("par")}</th>
            <th className="p-3 hidden md:table-cell">{t("supplier")}</th>{isManager && <th></th>}
          </tr></thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className={`border-t ${i.currentQty < i.minQty ? "bg-red-50" : ""}`}>
                {isManager && <td className="p-3"><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleSel(sel, setSel, i.id)} /></td>}
                <td className="p-3">{name(i)} <span className="badge bg-gray-100 ms-1">{i.kind === "PREP" ? t("prep") : t("inventory")}</span></td>
                <td className="p-3 text-center font-medium">{i.currentQty} {i.unit}</td>
                <td className="p-3 text-center text-gray-500">{i.minQty}</td>
                <td className="p-3 text-center text-gray-500">{i.parQty}</td>
                <td className="p-3 hidden md:table-cell">{i.supplier ? name(i.supplier) : "—"}</td>
                {isManager && <td className="p-3"><button className="text-brand-600" onClick={() => setEditing(i)}>{t("edit")}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-30 p-0 md:p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{editing.id ? t("edit") : t("add")}</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="שם עברית"><Input value={editing.nameHe} onChange={(e) => setEditing({ ...editing, nameHe: e.target.value })} /></Field>
              <Field label="Name (EN)"><Input value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} /></Field>
              <Field label={t("unit")}><Input value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} /></Field>
              <Field label="Kind">
                <select className="touch-input" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                  <option value="RAW">RAW</option><option value="PREP">PREP</option>
                </select>
              </Field>
              <Field label={t("category")}>
                <select className="touch-input" value={editing.categoryId || ""} onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })}>
                  <option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
                </select>
              </Field>
              <Field label={t("supplier")}>
                <select className="touch-input" value={editing.supplierId || ""} onChange={(e) => setEditing({ ...editing, supplierId: e.target.value })}>
                  <option value="">—</option>{sups.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
                </select>
              </Field>
              <Field label={t("area")}>
                <select className="touch-input" value={editing.area || "KITCHEN"} onChange={(e) => setEditing({ ...editing, area: e.target.value })}>
                  <option value="KITCHEN">{t("kitchen")}</option><option value="FLOOR">{t("floor")}</option>
                </select>
              </Field>
              <Field label={t("inCount")}>
                <select className="touch-input" value={editing.inCount === false ? "no" : "yes"} onChange={(e) => setEditing({ ...editing, inCount: e.target.value === "yes" })}>
                  <option value="yes">✓</option><option value="no">✕</option>
                </select>
              </Field>
              <Field label={t("current")}><Input type="number" value={editing.currentQty} onChange={(e) => setEditing({ ...editing, currentQty: e.target.value })} /></Field>
              <Field label={t("min")}><Input type="number" value={editing.minQty} onChange={(e) => setEditing({ ...editing, minQty: e.target.value })} /></Field>
              <Field label={t("par")}><Input type="number" value={editing.parQty} onChange={(e) => setEditing({ ...editing, parQty: e.target.value })} /></Field>
              <Field label="Avg usage/day"><Input type="number" value={editing.avgDailyUsage} onChange={(e) => setEditing({ ...editing, avgDailyUsage: e.target.value })} /></Field>
            </div>
            <div className="border-t pt-2">
              <p className="text-sm font-medium text-gray-600 mb-2">{t("orderUnit")}</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="יח' הזמנה (עב)"><Input value={editing.orderUnitNameHe || ""} placeholder="קופסה" onChange={(e) => setEditing({ ...editing, orderUnitNameHe: e.target.value })} /></Field>
                <Field label="Order unit (EN)"><Input value={editing.orderUnitNameEn || ""} placeholder="box" onChange={(e) => setEditing({ ...editing, orderUnitNameEn: e.target.value })} /></Field>
                <Field label={t("unitsPerOrderUnit")}><Input type="number" value={editing.unitsPerOrderUnit ?? ""} placeholder="10" onChange={(e) => setEditing({ ...editing, unitsPerOrderUnit: e.target.value })} /></Field>
              </div>
            </div>
            <Field label={t("notes")}><Input value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={save}>{t("save")}</button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>{t("cancel")}</button>
            </div>
            {editing.id && isManager && (
              <button className="btn-danger w-full mt-1" onClick={() => remove(editing.id)}>{t("delete")}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
