"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Input, Field, SearchInput, Badge, EmptyState, PageSpinner } from "@/components/ui";
import { Plus, Pencil } from "lucide-react";

const blank = { nameHe: "", nameEn: "", unit: "kg", kind: "RAW", area: "KITCHEN", inCount: true,
  categoryId: "", supplierId: "", locationId: "", currentQty: 0, minQty: 0, parQty: 0, avgDailyUsage: 0,
  orderUnitNameHe: "", orderUnitNameEn: "", unitsPerOrderUnit: "",
  messageUnitHe: "", messageUnitEn: "", showBaseQuantityInMessage: false,
  notes: "" };

export default function InventoryPage() {
  const { t, name } = useI18n();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const isManager = ["MANAGER", "ADMIN"].includes(role);
  const isAdmin = role === "ADMIN";
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [sups, setSups] = useState<any[]>([]);
  const [locs, setLocs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [areaTab, setAreaTab] = useState<"KITCHEN" | "FLOOR">("KITCHEN");
  const [editing, setEditing] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selArch, setSelArch] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<any | null>(null); // result modal
  const [forceDeleteOpen, setForceDeleteOpen] = useState(false);
  const [forceConfirmText, setForceConfirmText] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [bulkCat, setBulkCat] = useState("");
  const [quickSupplier, setQuickSupplier] = useState("");
  const [quickQty, setQuickQty] = useState<Record<string, string>>({});
  const [quickNotes, setQuickNotes] = useState<Record<string, string>>({});
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickMsg, setQuickMsg] = useState("");

  const load = () => api("/api/inventory").then((d) => { setItems(d); setLoading(false); });
  const loadArchived = () => api("/api/inventory?archived=1").then(setArchived);
  useEffect(() => { load(); api("/api/categories").then(setCats); api("/api/suppliers").then(setSups); api("/api/locations").then(setLocs); }, []);

  function toggleArchived() { const n = !showArchived; setShowArchived(n); if (n) loadArchived(); }

  async function save() {
    const body = { ...editing,
      currentQty: Number(editing.currentQty), minQty: Number(editing.minQty), parQty: Number(editing.parQty),
      avgDailyUsage: Number(editing.avgDailyUsage),
      unitsPerOrderUnit: editing.unitsPerOrderUnit === "" || editing.unitsPerOrderUnit == null ? null : Number(editing.unitsPerOrderUnit),
      orderUnitNameHe: editing.orderUnitNameHe || null, orderUnitNameEn: editing.orderUnitNameEn || null,
      messageUnitHe: editing.messageUnitHe || null, messageUnitEn: editing.messageUnitEn || null,
      showBaseQuantityInMessage: !!editing.showBaseQuantityInMessage,
      categoryId: editing.categoryId || null, supplierId: editing.supplierId || null,
      locationId: editing.locationId || null };
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
    setBusy(true);
    try {
      const res = await api("/api/inventory/bulk", { method: "POST", body: JSON.stringify({ action: "permanentDelete", ids: [...selArch] }) });
      setBulkResult(res);
      setSelArch(new Set()); loadArchived(); load();
    } catch (e: any) {
      setBulkResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function bulkForceDelete() {
    if (forceConfirmText !== "DELETE") return;
    setBusy(true);
    setForceDeleteOpen(false);
    setForceConfirmText("");
    try {
      const res = await api("/api/inventory/bulk", { method: "POST", body: JSON.stringify({ action: "forceDelete", ids: [...selArch] }) });
      setBulkResult(res);
      setSelArch(new Set()); loadArchived(); load();
    } catch (e: any) {
      setBulkResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function doMerge() {
    if (!mergeTarget) return;
    setBusy(true);
    try {
      const dupes = [...sel].filter((id) => id !== mergeTarget);
      await api("/api/inventory/merge", { method: "POST", body: JSON.stringify({ targetId: mergeTarget, duplicateIds: dupes }) });
      setMergeOpen(false); setMergeTarget(""); setSel(new Set());
      load(); if (showArchived) loadArchived();
    } catch (e: any) {
      setBulkResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  }

  const quickItems = quickSupplier ? items.filter((i) => i.supplierId === quickSupplier) : [];

  function onQuickSupplierChange(id: string) {
    setQuickSupplier(id); setQuickQty({}); setQuickNotes({}); setQuickMsg("");
  }

  async function saveQuickUpdate() {
    const changed = quickItems.filter((i) => quickQty[i.id] !== undefined && quickQty[i.id] !== "" && Number(quickQty[i.id]) !== i.currentQty);
    if (!changed.length) return;
    setQuickSaving(true); setQuickMsg("");
    try {
      await api("/api/inventory/quick-update", {
        method: "POST",
        body: JSON.stringify({
          supplierId: quickSupplier,
          items: changed.map((i) => ({ itemId: i.id, newQty: Number(quickQty[i.id]), note: quickNotes[i.id] || undefined })),
        }),
      });
      setQuickQty({}); setQuickNotes({}); setQuickMsg(t("quickUpdateSuccess")); load();
    } catch (e: any) { setQuickMsg(e.message || "Error"); }
    finally { setQuickSaving(false); }
  }

  const filtered = items.filter((i) =>
    (i.area || "KITCHEN") === areaTab &&
    (name(i).toLowerCase().includes(search.toLowerCase()) || i.nameHe.includes(search) || i.nameEn.toLowerCase().includes(search.toLowerCase())));

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{t("inventory")}</h1>
        <div className="flex gap-2">
          {isAdmin && <button className="btn-ghost text-sm" onClick={toggleArchived}>{showArchived ? t("hideArchived") : t("viewArchived")}</button>}
          {isManager && <button className="btn-primary" onClick={() => setEditing({ ...blank })}><Plus className="h-4 w-4" />{t("add")}</button>}
        </div>
      </div>
      <SearchInput placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />

      {/* Separate inventory by area */}
      <div className="seg">
        {(["KITCHEN", "FLOOR"] as const).map((a) => (
          <button key={a} onClick={() => setAreaTab(a)} className={`seg-btn ${areaTab === a ? "is-active" : ""}`}>
            {t(a === "KITCHEN" ? "kitchen" : "floor")}
          </button>
        ))}
      </div>

      {isAdmin && showArchived && (
        <Card className="p-0 overflow-hidden tone-peach border-transparent">
          <div className="px-4 py-2.5 text-sm font-semibold flex flex-wrap justify-between items-center gap-2">
            <span>{t("archived")}</span>
            {selArch.size > 0 && (
              <span className="flex gap-2 flex-wrap">
                <button className="btn-primary text-xs" onClick={bulkRestore} disabled={busy}>{t("bulkRestore")} ({selArch.size})</button>
                <button className="btn-danger text-xs" onClick={bulkPermanentDelete} disabled={busy}>{busy ? t("processing") : `${t("bulkPermanentDelete")} (${selArch.size})`}</button>
                {isAdmin && (
                  <button
                    className="btn-danger text-xs bg-red-900 hover:bg-red-800"
                    onClick={() => { setForceConfirmText(""); setForceDeleteOpen(true); }}
                    disabled={busy}
                  >
                    ⚠ {t("forceDeleteSelected")} ({selArch.size})
                  </button>
                )}
              </span>
            )}
          </div>
          <table className="w-full text-sm">
            <tbody>
              {archived.length === 0 && <tr><td className="p-3"><EmptyState label={t("noData")} /></td></tr>}
              {archived.map((i) => (
                <tr key={i.id} className="border-t border-black/5">
                  <td className="p-3 w-8"><input type="checkbox" checked={selArch.has(i.id)} onChange={() => toggleSel(selArch, setSelArch, i.id)} /></td>
                  <td className="p-3 font-medium">{name(i)}</td>
                  <td className="p-3 text-gray-500">{i.deletedAt ? new Date(i.deletedAt).toLocaleDateString() : ""}</td>
                  <td className="p-3 text-end">
                    <div className="flex gap-3 justify-end">
                      <button className="text-brand-700 font-medium" onClick={() => restore(i.id)}>{t("restore")}</button>
                      <button className="text-red-600 font-medium" onClick={() => permanentDelete(i.id)}>{t("permanentDelete")}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {isManager && sel.size > 0 && (
        <div className="sticky top-28 z-10 flex flex-wrap items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl p-2.5 shadow-card">
          <span className="text-sm font-medium">{sel.size} {t("selected")}</span>
          <button className="btn-danger text-xs" onClick={bulkArchive}>{t("bulkArchive")}</button>
          <select className="touch-input h-9 w-auto text-sm" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)}>
            <option value="">{t("assignCategory")}…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
          </select>
          <button className="btn-ghost text-xs" disabled={!bulkCat} onClick={bulkAssignCategory}>{t("save")}</button>
          {isAdmin && sel.size >= 2 && (
            <button className="btn-ghost text-xs" onClick={() => { setMergeTarget([...sel][0]); setMergeOpen(true); }}>{t("merge")}</button>
          )}
          <button className="btn-ghost text-xs" onClick={() => setSel(new Set())}>{t("cancel")}</button>
        </div>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-gray-500"><tr>
            {isManager && <th className="p-3.5 w-8"></th>}
            <th className="text-start p-3.5 text-xs font-semibold uppercase tracking-wide">{t("item")}</th>
            <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">{t("current")}</th>
            <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">{t("min")}</th>
            <th className="p-3.5 text-xs font-semibold uppercase tracking-wide">{t("par")}</th>
            <th className="p-3.5 hidden md:table-cell text-xs font-semibold uppercase tracking-wide">{t("supplier")}</th>{isManager && <th></th>}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={isManager ? 7 : 5}><EmptyState label={t("noData")} /></td></tr>
            )}
            {filtered.map((i) => (
              <tr key={i.id} className={`border-t border-gray-100 transition-colors hover:bg-gray-50 ${i.currentQty < i.minQty ? "bg-red-50/60" : ""}`}>
                {isManager && <td className="p-3.5"><input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleSel(sel, setSel, i.id)} /></td>}
                <td className="p-3.5 font-medium text-gray-900">{name(i)} <Badge tone="neutral" className="ms-1">{i.kind === "PREP" ? t("prep") : t("inventory")}</Badge></td>
                <td className="p-3.5 text-center font-semibold tabular-nums">{i.currentQty} {i.unit}</td>
                <td className="p-3.5 text-center text-gray-500 tabular-nums">{i.minQty}</td>
                <td className="p-3.5 text-center text-gray-500 tabular-nums">{i.parQty}</td>
                <td className="p-3.5 hidden md:table-cell">{i.supplier ? name(i.supplier) : "—"}</td>
                {isManager && <td className="p-3.5"><button className="text-brand-700 font-medium inline-flex items-center gap-1" onClick={() => setEditing(i)}><Pencil className="h-3.5 w-3.5" />{t("edit")}</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {isManager && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">{t("quickUpdateBySupplier")}</h2>
          <Card>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <select className="touch-input h-10 w-auto" value={quickSupplier} onChange={(e) => onQuickSupplierChange(e.target.value)}>
                <option value="">{t("selectSupplier")}…</option>
                {sups.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
              </select>
              {quickMsg && <span className={`text-sm ${quickMsg.includes("Error") ? "text-red-600" : "text-emerald-600"}`}>{quickMsg}</span>}
            </div>
            {quickSupplier && quickItems.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500"><tr>
                      <th className="text-start p-2">{t("item")}</th>
                      <th className="p-2">{t("current")}</th>
                      <th className="p-2">{t("unit")}</th>
                      <th className="p-2">{t("newQty")}</th>
                      <th className="text-start p-2">{t("note")}</th>
                    </tr></thead>
                    <tbody>{quickItems.map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="p-2">{name(i)}</td>
                        <td className="p-2 text-center font-medium">{i.currentQty}</td>
                        <td className="p-2 text-center text-gray-500">{i.unit}</td>
                        <td className="p-2 text-center">
                          <input className="touch-input h-10 w-24 text-center" type="number"
                            placeholder={String(i.currentQty)}
                            value={quickQty[i.id] ?? ""}
                            onChange={(e) => setQuickQty((q) => ({ ...q, [i.id]: e.target.value }))} />
                        </td>
                        <td className="p-2">
                          <input className="touch-input h-10 w-full" type="text"
                            value={quickNotes[i.id] ?? ""}
                            onChange={(e) => setQuickNotes((n) => ({ ...n, [i.id]: e.target.value }))} />
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="flex justify-end mt-3">
                  <button className="btn-primary" onClick={saveQuickUpdate} disabled={quickSaving}>
                    {quickSaving ? t("processing") : t("saveQuantities")}
                  </button>
                </div>
              </>
            )}
            {quickSupplier && quickItems.length === 0 && <p className="text-sm text-gray-400">{t("noData")}</p>}
          </Card>
        </section>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900">{editing.id ? t("edit") : t("add")}</h2>
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
              <Field label={t("location")}>
                <select className="touch-input" value={editing.locationId || ""} onChange={(e) => setEditing({ ...editing, locationId: e.target.value })}>
                  <option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{name(l)}</option>)}
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
            <div className="border-t pt-2">
              <p className="text-sm font-medium text-gray-600 mb-2">{t("supplierMessage")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="יח' בסיס בהודעה (עב)"><Input value={editing.messageUnitHe || ""} placeholder="בקבוקים" onChange={(e) => setEditing({ ...editing, messageUnitHe: e.target.value })} /></Field>
                <Field label="Base unit in msg (EN)"><Input value={editing.messageUnitEn || ""} placeholder="bottles" onChange={(e) => setEditing({ ...editing, messageUnitEn: e.target.value })} /></Field>
              </div>
              <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
                <input type="checkbox" checked={!!editing.showBaseQuantityInMessage}
                  onChange={(e) => setEditing({ ...editing, showBaseQuantityInMessage: e.target.checked })} />
                {t("showBaseQtyInMessage")}
              </label>
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

      {/* Bulk permanent-delete result */}
      {bulkResult && (
        <div className="modal-overlay" onClick={() => setBulkResult(null)}>
          <div className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900">{t("result")}</h2>
            {bulkResult.error ? (
              <p className="text-red-600">{bulkResult.error}</p>
            ) : (
              <>
                <div className="flex gap-4 text-sm">
                  <span className="rounded-xl bg-emerald-50 text-emerald-700 px-3 py-1.5 font-medium">{t("deleted")}: <b>{bulkResult.deletedCount}</b></span>
                  <span className="rounded-xl bg-amber-50 text-amber-700 px-3 py-1.5 font-medium">{t("kept")}: <b>{bulkResult.failedCount}</b></span>
                </div>
                {bulkResult.failedCount > 0 && (
                  <>
                    <p className="text-xs text-gray-500">{t("cannotPermanentDelete")}</p>
                    <ul className="divide-y divide-gray-100 text-sm">
                      {bulkResult.failed.map((f: any) => (
                        <li key={f.id} className="py-2 flex justify-between gap-2">
                          <span className="font-medium">{name(f)}</span>
                          <span className="text-gray-500 text-end">{f.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {!bulkResult.forceDelete && bulkResult.failedCount > 0 && isAdmin && (
                  <p className="text-xs text-red-700 border border-red-200 rounded-xl p-2.5 bg-red-50">
                    ⚠ {t("forceDeleteWarning").split(".")[0]}. {t("typeDeleteToConfirm").toLowerCase()}.
                  </p>
                )}
              </>
            )}
            <button className="btn-primary w-full" onClick={() => setBulkResult(null)}>{t("save")}</button>
          </div>
        </div>
      )}

      {/* Force delete confirmation — admin only, requires typing DELETE */}
      {forceDeleteOpen && isAdmin && (
        <div className="modal-overlay bg-red-950/60" onClick={() => setForceDeleteOpen(false)}>
          <div className="modal-panel max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠</span>
              <h2 className="text-xl font-bold text-red-700">{t("forceDeleteSelected")}</h2>
            </div>
            <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 leading-relaxed">
              {t("forceDeleteWarning")}
            </p>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("typeDeleteToConfirm")}:</p>
              <Input
                value={forceConfirmText}
                onChange={(e) => setForceConfirmText(e.target.value)}
                placeholder="DELETE"
                className="font-mono"
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                className="btn-danger flex-1 bg-red-700 hover:bg-red-800"
                onClick={bulkForceDelete}
                disabled={forceConfirmText !== "DELETE" || busy}
              >
                {t("forceDeleteConfirmBtn")} ({selArch.size})
              </button>
              <button className="btn-ghost" onClick={() => setForceDeleteOpen(false)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Merge duplicates (admin) */}
      {mergeOpen && (
        <div className="modal-overlay" onClick={() => setMergeOpen(false)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900">{t("merge")}</h2>
            <p className="text-sm text-gray-500">{t("selectTarget")}</p>
            <ul className="space-y-1">
              {[...sel].map((id) => {
                const it = items.find((x) => x.id === id);
                if (!it) return null;
                return (
                  <li key={id}>
                    <label className="flex items-center gap-2 py-1">
                      <input type="radio" name="mergeTarget" checked={mergeTarget === id} onChange={() => setMergeTarget(id)} />
                      <span>{name(it)} <span className="text-gray-400 text-xs">· {t("current")} {it.currentQty} {it.unit}</span></span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-gray-400">{t("mergeInto")}: {name(items.find((x) => x.id === mergeTarget) || {})}</p>
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={doMerge} disabled={busy || !mergeTarget}>{busy ? t("processing") : t("merge")}</button>
              <button className="btn-ghost" onClick={() => setMergeOpen(false)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
