"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Input, Spinner } from "@/components/ui";

type Row = { itemId: string; rawName: string; receivedQty: string; unit: string; note: string; isShort: boolean };

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SUBMITTED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function DeliveriesPage() {
  const { t, name } = useI18n();
  const { data: session } = useSession();
  const isManager = ["MANAGER", "ADMIN"].includes((session?.user as any)?.role);

  const [items, setItems] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [reporting, setReporting] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = () => Promise.all([api("/api/inventory"), api("/api/deliveries")]).then(([inv, d]) => { setItems(inv); setDeliveries(d); });
  useEffect(() => { load(); }, []);

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
    const fd = new FormData(); fd.append("file", file);
    try {
      const res = await fetch("/api/deliveries/ocr", { method: "POST", body: fd }).then((r) => r.json());
      setProvider(res.provider); setOcrText(res.extracted?.rawText ?? null); setReporting(true);
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
      await api("/api/deliveries", { method: "POST", body: JSON.stringify({ items: payload, status: "SUBMITTED", ocrRaw: ocrText }) });
      setRows([]); setReporting(false); setOcrText(null); load();
    } catch (e: any) { setError(e.message); }
  }

  async function review(id: string, action: "APPROVE" | "REJECT") {
    await api(`/api/deliveries/${id}/approve`, { method: "POST", body: JSON.stringify({ action }) });
    load();
  }

  if (!items.length && !deliveries.length) return <div className="flex justify-center py-20"><Spinner /></div>;

  const pending = deliveries.filter((d) => d.status === "SUBMITTED");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("deliveries")}</h1>

      {/* Report received goods (employee + manager) */}
      <Card className="space-y-3">
        <h2 className="font-semibold">{t("reportReceived")}</h2>
        <p className="text-sm text-gray-500">{t("review")} — inventory is updated only after manager approval.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="btn-ghost cursor-pointer">
            {t("uploadReceipt")} (OCR)
            <input type="file" accept="image/*,application/pdf" capture="environment" onChange={upload} className="hidden" />
          </label>
          <button className="btn-ghost" onClick={addRow}>+ {t("addProduct")}</button>
          {uploading && <Spinner />}
          {provider && <span className="text-xs text-gray-400">OCR: {provider}</span>}
        </div>

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
                  <td className="p-2 text-center"><button className="text-red-600" onClick={() => removeRow(idx)} aria-label={t("remove")}>✕</button></td>
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
              <div key={d.id} className="border rounded-xl p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{d.receivedBy?.name}</span>
                    <span className="badge ms-2 bg-gray-100">{d.items.length} {t("item")}</span>
                    {d.hasShortage && <span className="badge ms-2 bg-red-100 text-red-700">{t("shortage")}</span>}
                    <p className="text-xs text-gray-400">{new Date(d.receivedAt).toLocaleString()}</p>
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
        <h2 className="font-semibold text-lg">{t("history")}</h2>
        {deliveries.map((d) => (
          <Card key={d.id} className="flex justify-between">
            <div>
              <span className="font-medium">{d.order ? name(d.order.supplier) : "—"}</span>
              <span className="badge ms-2 bg-gray-100">{d.items.length} {t("item")}</span>
              {d.hasShortage && <span className="badge ms-2 bg-red-100 text-red-700">{t("shortage")}</span>}
              <p className="text-sm text-gray-400">{new Date(d.receivedAt).toLocaleString()} · {d.receivedBy?.name}</p>
            </div>
            <span className={`badge ${STATUS_TONE[d.status] || "bg-gray-100"}`}>
              {d.status === "SUBMITTED" ? t("statusSubmitted") : d.status === "APPROVED" ? t("statusApproved") : d.status === "REJECTED" ? t("statusRejected") : t("draft")}
            </span>
          </Card>
        ))}
      </section>
    </div>
  );
}
