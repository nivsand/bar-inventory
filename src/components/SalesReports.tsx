"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { TKey } from "@/lib/i18n/translations";
import { api } from "@/lib/fetcher";
import { Card, Input, Spinner } from "@/components/ui";

const SUBTABS = ["upload", "byWeek", "byProduct", "unmapped", "mappings"] as const;
type SubTab = (typeof SUBTABS)[number];

const SUBTAB_LABEL: Record<SubTab, TKey> = {
  upload: "uploadSales", byWeek: "salesByWeek", byProduct: "salesByProduct",
  unmapped: "unmapped", mappings: "productMappings",
};

const STATUS_TONE: Record<string, string> = {
  PENDING_MAPPING: "bg-amber-100 text-amber-800",
  PROCESSED: "bg-emerald-100 text-emerald-700",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function SalesReports() {
  const { t } = useI18n();
  const [sub, setSub] = useState<SubTab>("upload");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SUBTABS.map((s) => (
          <button key={s} onClick={() => setSub(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${sub === s ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"}`}>
            {t(SUBTAB_LABEL[s])}
          </button>
        ))}
      </div>

      {sub === "upload" && <UploadTab />}
      {sub === "byWeek" && <ByWeekTab />}
      {sub === "byProduct" && <ByProductTab />}
      {sub === "unmapped" && <UnmappedTab />}
      {sub === "mappings" && <MappingsTab />}
    </div>
  );
}

function UploadTab() {
  const { t } = useI18n();
  const [periodStart, setPeriodStart] = useState(todayStr());
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState<any[] | null>(null);

  const load = () => api("/api/sales/uploads").then(setUploads).catch(() => setUploads([]));
  useEffect(() => { load(); }, []);

  async function submit() {
    setError("");
    if (!file && !pasteText.trim()) { setError(t("noData")); return; }
    setBusy(true);
    try {
      const form = new FormData();
      if (file) form.append("file", file);
      if (pasteText.trim()) form.append("pasteText", pasteText);
      form.append("periodStart", periodStart);
      await api("/api/sales/uploads", { method: "POST", body: form, headers: {} });
      setFile(null); setPasteText("");
      load();
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-500">{t("periodStart")}</label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-gray-500">{t("uploadFile")}</label>
            <input type="file" accept=".csv,.xlsx,.xls" className="touch-input w-full"
              onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
        </div>
        <div>
          <label className="text-sm text-gray-500">{t("pasteData")}</label>
          <textarea className="touch-input w-full h-32 font-mono text-xs" placeholder="Product\tQty\tRevenue"
            value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "…" : t("upload")}</button>
      </Card>

      <Card className="p-0 overflow-x-auto">
        {uploads === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : uploads.length === 0 ? (
          <p className="p-4 text-gray-400">{t("noData")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500"><tr>
              <th className="text-start p-3">{t("year")}</th><th className="p-3">{t("week")}</th>
              <th className="p-3">{t("uploadedBy")}</th><th className="p-3">{t("uploadedAt")}</th>
              <th className="p-3">{t("item")}</th><th className="p-3">{t("status")}</th>
            </tr></thead>
            <tbody>{uploads.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3">{u.year}</td>
                <td className="p-3 text-center">{u.weekNumber}</td>
                <td className="p-3">{u.uploadedBy?.name}</td>
                <td className="p-3 whitespace-nowrap">{new Date(u.uploadedAt).toLocaleString()}</td>
                <td className="p-3 text-center text-gray-500">{u._count?.lines}</td>
                <td className="p-3 text-center"><span className={`badge ${STATUS_TONE[u.status] || "bg-gray-100"}`}>{u.status}</span></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function ByWeekTab() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api("/api/reports/sales-weekly?format=json").then((d) => setRows(d.rows)).catch(() => setRows([])); }, []);

  return (
    <Card className="p-0 overflow-x-auto">
      {rows === null ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className="p-4 text-gray-400">{t("noData")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500"><tr>
            <th className="text-start p-3">{t("year")}</th><th className="p-3">{t("week")}</th>
            <th className="text-start p-3">{t("item")}</th><th className="p-3">{t("totalQty")}</th><th className="p-3">{t("revenue")}</th>
          </tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-3">{r.year}</td>
              <td className="p-3 text-center">{r.week}</td>
              <td className="p-3">{r.item}</td>
              <td className="p-3 text-center">{r.quantitySold}</td>
              <td className="p-3 text-center">{r.revenue}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

function ByProductTab() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api("/api/reports/sales-by-product?format=json").then((d) => setRows(d.rows)).catch(() => setRows([])); }, []);

  return (
    <Card className="p-0 overflow-x-auto">
      {rows === null ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className="p-4 text-gray-400">{t("noData")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500"><tr>
            <th className="text-start p-3">{t("item")}</th><th className="p-3">{t("totalQty")}</th>
            <th className="p-3">{t("totalRevenue")}</th><th className="p-3">{t("week")}s</th>
          </tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-3">{r.item}</td>
              <td className="p-3 text-center">{r.totalQty}</td>
              <td className="p-3 text-center">{r.totalRevenue}</td>
              <td className="p-3 text-center text-gray-500">{r.weeks}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

function UnmappedTab() {
  const { t, name } = useI18n();
  const [lines, setLines] = useState<any[] | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  function load() {
    setLines(null);
    api("/api/sales/unmapped").then(setLines).catch(() => setLines([]));
  }
  useEffect(() => { load(); api("/api/inventory").then(setItems).catch(() => {}); }, []);

  const sortedItems = [...items].sort((a, b) => name(a).localeCompare(name(b)));

  async function save(lineId: string) {
    const itemId = picked[lineId];
    if (!itemId) return;
    setSaving(lineId);
    try {
      await api(`/api/sales/lines/${lineId}/map`, { method: "POST", body: JSON.stringify({ itemId }) });
      setLines((ls) => (ls || []).filter((l) => l.id !== lineId));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="p-0 overflow-x-auto">
      {lines === null ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : lines.length === 0 ? (
        <p className="p-4 text-gray-400">{t("noData")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500"><tr>
            <th className="text-start p-3">{t("posProductName")}</th><th className="p-3">{t("quantity")}</th>
            <th className="p-3">{t("year")}/{t("week")}</th><th className="text-start p-3">{t("mapTo")}</th><th className="p-3"></th>
          </tr></thead>
          <tbody>{lines.map((l) => {
            const suggestionIds = new Set((l.suggestions || []).map((s: any) => s.id));
            const suggested = items.filter((i) => suggestionIds.has(i.id));
            const rest = sortedItems.filter((i) => !suggestionIds.has(i.id));
            return (
              <tr key={l.id} className="border-t">
                <td className="p-3">{l.posProductName}</td>
                <td className="p-3 text-center">{l.quantitySold}</td>
                <td className="p-3 text-center text-gray-500">{l.upload?.year}/{l.upload?.weekNumber}</td>
                <td className="p-3">
                  <select className="touch-input h-9 text-sm" value={picked[l.id] || ""} onChange={(e) => setPicked((p) => ({ ...p, [l.id]: e.target.value }))}>
                    <option value="">—</option>
                    {suggested.length > 0 && <optgroup label="Suggested">{suggested.map((i) => <option key={i.id} value={i.id}>{name(i)}</option>)}</optgroup>}
                    <optgroup label={t("all")}>{rest.map((i) => <option key={i.id} value={i.id}>{name(i)}</option>)}</optgroup>
                  </select>
                </td>
                <td className="p-3 text-end">
                  <button className="btn-primary text-sm" disabled={!picked[l.id] || saving === l.id} onClick={() => save(l.id)}>
                    {saving === l.id ? "…" : t("saveMapping")}
                  </button>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
    </Card>
  );
}

function MappingsTab() {
  const { t, name } = useI18n();
  const [mappings, setMappings] = useState<any[] | null>(null);
  const load = () => api("/api/sales/mappings").then(setMappings).catch(() => setMappings([]));
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    await api(`/api/sales/mappings/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <Card className="p-0 overflow-x-auto">
      {mappings === null ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : mappings.length === 0 ? (
        <p className="p-4 text-gray-400">{t("noData")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500"><tr>
            <th className="text-start p-3">{t("posProductName")}</th><th className="text-start p-3">{t("item")}</th><th className="p-3"></th>
          </tr></thead>
          <tbody>{mappings.map((m) => (
            <tr key={m.id} className="border-t">
              <td className="p-3">{m.posProductName}</td>
              <td className="p-3">{name(m.item)}</td>
              <td className="p-3 text-end"><button className="text-red-600" onClick={() => remove(m.id)}>{t("delete")}</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}
