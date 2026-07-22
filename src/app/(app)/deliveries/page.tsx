"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Input, PageSpinner, Spinner, Badge, EmptyState } from "@/components/ui";
import { Upload, Plus, X } from "lucide-react";

type Row = { itemId: string; rawName: string; receivedQty: string; unit: string; note: string; isShort: boolean };

const STATUS_TONE: Record<string, "neutral" | "warn" | "ok" | "danger"> = {
  DRAFT: "neutral",
  SUBMITTED: "warn",
  APPROVED: "ok",
  REJECTED: "danger",
};

export default function DeliveriesPage() {
  const { t, name } = useI18n();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const isManager = ["MANAGER", "ADMIN"].includes(role);
  const isAdmin = role === "ADMIN";

  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [reporting, setReporting] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null); // data URL of the uploaded receipt image
  const [provider, setProvider] = useState<string>("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [viewImg, setViewImg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const load = () => Promise.all([api("/api/inventory"), api("/api/deliveries")]).then(([inv, d]) => { setItems(inv); setDeliveries(d); });
  useEffect(() => { load(); api("/api/suppliers").then(setSuppliers).catch(() => {}); }, []);

  const blankRow = (): Row => ({ itemId: "", rawName: "", receivedQty: "", unit: "", note: "", isShort: false });
  const update = (idx: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRow = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx));
  const addRow = () => { setReporting(true); setRows((rs) => [...rs, blankRow()]); };

  function onPickItem(idx: number, itemId: string) {
    const it = items.find((i) => i.id === itemId);
    update(idx, { itemId, unit: rows[idx].unit || it?.unit || "unit", rawName: rows[idx].rawName || (it ? name(it) : "") });
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setError("");
    // Keep the image (as a data URL) so it can be saved with the report and viewed later.
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setReceipt(typeof reader.result === "string" ? reader.result : null);
      reader.readAsDataURL(file);
    }
    const fd = new FormData(); fd.append("file", file);
    try {
      const res = await fetch("/api/deliveries/ocr", { method: "POST", body: fd }).then((r) => r.json());
      setProvider(res.provider); setConfidence(typeof res.extracted?.confidence === "number" ? res.extracted.confidence : null);
      setOcrText(res.extracted?.rawText ?? null); setReporting(true);
      setRows(
        (res.extracted.items as any[]).map((it) => ({
          itemId: it.matchedItemId || "",
          rawName: it.rawName || "",
          receivedQty: String(it.quantity ?? ""),
          unit: it.unit || it.matchedItem?.unit || "",
          note: "", isShort: false,
        }))
      );
    } catch (e: any) { setError(e.message || "OCR failed"); }
    finally { setUploading(false); }
  }

  async function submitReport() {
    setError("");
    const payload = rows
      .filter((r) => r.itemId && r.receivedQty !== "")
      .map((r) => ({ itemId: r.itemId, receivedQty: Number(r.receivedQty), unit: r.unit || "unit", isShort: r.isShort, note: r.note || null }));
    if (payload.length === 0) { setError(t("noData")); return; }
    try {
      await api("/api/deliveries", { method: "POST", body: JSON.stringify({ items: payload, status: "SUBMITTED", supplierId: supplierId || null, ocrRaw: ocrText, documentUrl: receipt }) });
      setRows([]); setReporting(false); setOcrText(null); setReceipt(null); setSupplierId(""); load();
    } catch (e: any) { setError(e.message); }
  }

  async function deleteDelivery(id: string) {
    if (!window.confirm(t("confirmDelete"))) return;
    try { await api(`/api/deliveries/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { alert(e.message); }
  }

  async function review(id: string, action: "APPROVE" | "REJECT") {
    await api(`/api/deliveries/${id}/approve`, { method: "POST", body: JSON.stringify({ action }) });
    load();
  }

  if (!items.length && !deliveries.length) return <PageSpinner />;

  const pending = deliveries.filter((d) => d.status === "SUBMITTED");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t("deliveries")}</h1>

      {/* Report received goods (employee + manager) */}
      <Card className="space-y-3">
        <h2 className="font-semibold">{t("reportReceived")}</h2>
        <p className="text-sm text-gray-500">{t("review")} — inventory is updated only after manager approval.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="btn-ghost cursor-pointer">
            <Upload className="h-4 w-4" />{t("uploadReceipt")} (OCR)
            <input type="file" accept="image/*,application/pdf" capture="environment" onChange={upload} className="hidden" />
          </label>
          <button className="btn-ghost" onClick={addRow}><Plus className="h-4 w-4" />{t("addProduct")}</button>
          {uploading && <Spinner />}
          {provider && <span className="text-xs text-gray-400">OCR: {provider}</span>}
          {confidence !== null && (
            <Badge tone={confidence >= 0.7 ? "ok" : confidence > 0 ? "warn" : "neutral"}>
              {t("confidence")}: {Math.round(confidence * 100)}%
            </Badge>
          )}
        </div>
        {receipt && (
          <button onClick={() => setViewImg(receipt)} className="block">
            <img src={receipt} alt={t("receiptImage")} className="h-28 rounded-xl border border-gray-200 object-cover" />
          </button>
        )}

        {reporting && (
          <div className="max-w-xs">
            <label className="text-sm text-gray-600">{t("supplier")}</label>
            <select className="touch-input mt-1" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
            </select>
          </div>
        )}

        {reporting && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500"><tr>
                <th className="text-start p-2">{t("item")}</th>
                <th className="p-2">{t("quantity")}</th>
                <th className="p-2">{t("unit")}</th>
                <th className="text-start p-2">{t("notes")}</th>
                <th className="p-2">{t("shortage")}</th>
                <th className="p-2"></th>
              </tr></thead>
              <tbody>{rows.map((r, idx) => (
                <tr key={idx} className="border-t align-top">
                  <td className="p-2">
                    <select className="touch-input h-11" value={r.itemId} onChange={(e) => onPickItem(idx, e.target.value)}>
                      <option value="">{r.rawName ? `? ${r.rawName}` : "—"}</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{name(i)}</option>)}
                    </select>
                  </td>
                  <td className="p-2"><input className="touch-input h-11 w-20 text-center" inputMode="decimal" value={r.receivedQty} onChange={(e) => update(idx, { receivedQty: e.target.value })} /></td>
                  <td className="p-2"><input className="touch-input h-11 w-16 text-center" value={r.unit} onChange={(e) => update(idx, { unit: e.target.value })} /></td>
                  <td className="p-2"><input className="touch-input h-11" value={r.note} onChange={(e) => update(idx, { note: e.target.value })} /></td>
                  <td className="p-2 text-center"><input type="checkbox" checked={r.isShort} onChange={(e) => update(idx, { isShort: e.target.checked })} /></td>
                  <td className="p-2 text-center"><button className="text-red-600 inline-flex" onClick={() => removeRow(idx)} aria-label={t("remove")}><X className="h-4 w-4" /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {reporting && rows.length > 0 && (
          <div className="flex gap-2">
            <button className="btn-primary" onClick={submitReport}>{t("submitReport")}</button>
            <button className="btn-ghost" onClick={() => { setRows([]); setReporting(false); setOcrText(null); }}>{t("cancel")}</button>
          </div>
        )}
      </Card>

      {/* Manager review queue */}
      {isManager && pending.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-2">{t("pendingReports")} · {t("approveReceived")}</h2>
          <div className="space-y-3">
            {pending.map((d) => (
              <div key={d.id} className="border border-gray-100 rounded-xl p-3.5">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium text-gray-900">{d.receivedBy?.name}</span>
                    <Badge tone="neutral" className="ms-2">{d.items.length} {t("item")}</Badge>
                    {d.hasShortage && <Badge tone="danger" className="ms-2">{t("shortage")}</Badge>}
                    <p className="text-xs text-gray-400 mt-1">{new Date(d.receivedAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary text-sm" onClick={() => review(d.id, "APPROVE")}>{t("approve")}</button>
                    <button className="btn-danger text-sm" onClick={() => review(d.id, "REJECT")}>{t("reject")}</button>
                  </div>
                </div>
                <ul className="mt-2 text-sm text-gray-600">
                  {d.items.map((di: any) => (
                    <li key={di.id} className="flex justify-between">
                      <span>{name(di.item)}</span><span>{di.receivedQty} {di.unit}{di.isShort ? ` · ${t("shortage")}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* History */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-lg">{t("history")}</h2>
          <div className="flex flex-wrap gap-1.5">
            {["ALL", "SUBMITTED", "APPROVED", "REJECTED"].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${statusFilter === s ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {s === "ALL" ? t("all") : s === "SUBMITTED" ? t("statusSubmitted") : s === "APPROVED" ? t("statusApproved") : t("statusRejected")}
              </button>
            ))}
          </div>
        </div>
        {deliveries.filter((d) => statusFilter === "ALL" || d.status === statusFilter).length === 0 && (
          <Card><EmptyState label={t("noData")} /></Card>
        )}
        {deliveries.filter((d) => statusFilter === "ALL" || d.status === statusFilter).map((d) => (
          <Card key={d.id} className="flex justify-between items-start gap-3">
            <div className="flex gap-3">
              {d.documentUrl && (
                <button onClick={() => setViewImg(d.documentUrl)} className="shrink-0">
                  <img src={d.documentUrl} alt={t("receiptImage")} className="h-14 w-14 rounded-xl border border-gray-200 object-cover" />
                </button>
              )}
              <div>
                <span className="font-medium text-gray-900">{d.order?.supplier ? name(d.order.supplier) : d.supplier ? name(d.supplier) : "—"}</span>
                <Badge tone="neutral" className="ms-2">{d.items.length} {t("item")}</Badge>
                {d.order && <Badge tone="info" className="ms-2">{t("orders")}</Badge>}
                {d.hasShortage && <Badge tone="danger" className="ms-2">{t("shortage")}</Badge>}
                <p className="text-sm text-gray-400 mt-1">{new Date(d.receivedAt).toLocaleString()} · {d.receivedBy?.name}</p>
                <div className="flex gap-3 mt-1">
                  {d.documentUrl && <button className="text-brand-700 text-sm font-medium" onClick={() => setViewImg(d.documentUrl)}>{t("viewImage")}</button>}
                  {isAdmin && <button className="text-red-600 text-sm font-medium" onClick={() => deleteDelivery(d.id)}>{t("delete")}</button>}
                </div>
              </div>
            </div>
            <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>
              {d.status === "SUBMITTED" ? t("statusSubmitted") : d.status === "APPROVED" ? t("statusApproved") : d.status === "REJECTED" ? t("statusRejected") : t("draft")}
            </Badge>
          </Card>
        ))}
      </section>

      {viewImg && (
        <div className="modal-overlay bg-gray-950/75" onClick={() => setViewImg(null)}>
          <img src={viewImg} alt={t("receiptImage")} className="max-h-[90vh] max-w-full rounded-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
