"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { TKey } from "@/lib/i18n/translations";
import { api } from "@/lib/fetcher";
import { Card, Spinner } from "@/components/ui";

const REPORTS: { type: string; labelKey: TKey }[] = [
  { type: "inventory", labelKey: "reportInventory" },
  { type: "waste", labelKey: "reportWasteH" },
  { type: "orders", labelKey: "reportOrders" },
  { type: "deliveries", labelKey: "reportDeliveries" },
];

export default function ReportsPage() {
  const { t } = useI18n();
  const [active, setActive] = useState<string>("inventory");
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    setRows(null);
    api(`/api/reports/${active}?format=json`).then((d) => setRows(d.rows)).catch(() => setRows([]));
  }, [active]);

  const headers = rows && rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("reports")}</h1>

      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button key={r.type} onClick={() => setActive(r.type)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${active === r.type ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600"}`}>
            {t(r.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <a className="btn-ghost text-sm" href={`/api/reports/${active}?format=csv`}>{t("export")} CSV</a>
      </div>

      <Card className="p-0 overflow-x-auto">
        {rows === null ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-gray-400">{t("noData")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500"><tr>{headers.map((h) => <th key={h} className="text-start p-3 whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t">
                  {headers.map((h) => <td key={h} className="p-3 whitespace-nowrap">{formatCell(row[h])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function formatCell(v: any) {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v ?? "");
}
