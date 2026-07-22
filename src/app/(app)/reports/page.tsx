"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { TKey } from "@/lib/i18n/translations";
import { api } from "@/lib/fetcher";
import { Card, Spinner, EmptyState } from "@/components/ui";
import { PieChart, Slice } from "@/components/PieChart";
import { SalesReports } from "@/components/SalesReports";
import { Download } from "lucide-react";

const REPORTS: { type: string; labelKey: TKey }[] = [
  { type: "inventory", labelKey: "reportInventory" },
  { type: "inventory-by-category", labelKey: "byCategory" },
  { type: "waste", labelKey: "reportWasteH" },
  { type: "orders", labelKey: "reportOrders" },
  { type: "deliveries", labelKey: "reportDeliveries" },
  { type: "sales", labelKey: "salesReports" },
];

// How each report aggregates into a pie chart: label column, value column
// (empty = count rows), and whether to use the absolute value.
const CHART: Record<string, { label: string; value: string; abs?: boolean }> = {
  "inventory": { label: "source", value: "delta", abs: true },
  "inventory-by-category": { label: "category", value: "quantity" },
  "waste": { label: "item", value: "qty" },
  "orders": { label: "supplier", value: "" },
  "deliveries": { label: "status", value: "" },
};

function aggregate(rows: any[], type: string): Slice[] {
  const cfg = CHART[type];
  if (!cfg) return [];
  const map = new Map<string, number>();
  for (const r of rows) {
    const label = String(r[cfg.label] ?? "—");
    const raw = cfg.value ? Number(r[cfg.value]) || 0 : 1;
    const v = cfg.abs ? Math.abs(raw) : raw;
    map.set(label, (map.get(label) ?? 0) + v);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}

export default function ReportsPage() {
  const { t } = useI18n();
  const [active, setActive] = useState<string>("inventory");
  const [view, setView] = useState<"table" | "chart">("table");
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    if (active === "sales") return;
    setRows(null);
    api(`/api/reports/${active}?format=json`).then((d) => setRows(d.rows)).catch(() => setRows([]));
  }, [active]);

  const headers = rows && rows.length ? Object.keys(rows[0]) : [];
  const slices = rows ? aggregate(rows, active) : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t("reports")}</h1>

      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button key={r.type} onClick={() => setActive(r.type)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-150 ${active === r.type ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {t(r.labelKey)}
          </button>
        ))}
      </div>

      {active === "sales" ? (
        <SalesReports />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="seg">
              {(["table", "chart"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`seg-btn ${view === v ? "is-active" : ""}`}>
                  {t(v === "table" ? "tableView" : "chartView")}
                </button>
              ))}
            </div>
            <a className="btn-ghost text-sm" href={`/api/reports/${active}?format=csv`}><Download className="h-4 w-4" />{t("export")} CSV</a>
          </div>

          <Card className="p-0 overflow-hidden">
            {rows === null ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : rows.length === 0 ? (
              <EmptyState label={t("noData")} />
            ) : view === "chart" ? (
              <PieChart data={slices} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-500"><tr>{headers.map((h) => <th key={h} className="text-start p-3.5 whitespace-nowrap text-xs font-semibold uppercase tracking-wide">{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                        {headers.map((h) => <td key={h} className="p-3.5 whitespace-nowrap">{formatCell(row[h])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function formatCell(v: any) {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  return String(v ?? "");
}
