"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Card } from "@/components/ui";

const REPORTS = [
  { type: "inventory", label: "Inventory history" },
  { type: "orders", label: "Order history" },
  { type: "waste", label: "Waste" },
  { type: "supplier-performance", label: "Supplier performance" },
  { type: "consumption", label: "Consumption trends" },
];

export default function ReportsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("reports")}</h1>
      <div className="grid md:grid-cols-2 gap-3">
        {REPORTS.map((r) => (
          <Card key={r.type} className="flex justify-between items-center">
            <span className="font-medium">{r.label}</span>
            <a className="btn-primary text-sm" href={`/api/reports/${r.type}?format=csv`}>{t("export")} CSV</a>
          </Card>
        ))}
      </div>
      <p className="text-sm text-gray-400">CSV opens directly in Excel. (XLSX export can be enabled server-side via the xlsx package.)</p>
    </div>
  );
}
