"use client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { Spinner, Badge } from "@/components/ui";

// Shared detail/review modal for a daily count. `detail` is the count object
// (from GET /api/counts/[id]), the string "loading", or null (hidden).
export function CountDetailModal({
  detail, isManager, onAction, onClose,
}: {
  detail: any;
  isManager: boolean;
  onAction?: (id: string, action: "APPROVE" | "RECOUNT" | "REJECT") => void;
  onClose: () => void;
}) {
  const { t, name } = useI18n();
  if (!detail) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
        {detail === "loading" ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-900">{t("dailyCount")} · {t("review")}</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <div>{t("location")}: <b className="text-gray-900">{detail.location ? name(detail.location) : t("fullCount")}</b></div>
              <div>{t("employee")}: <b className="text-gray-900">{detail.countedBy?.name}</b></div>
              <div>{t("date")}: {new Date(detail.submittedAt || detail.businessDay).toLocaleString()}</div>
              <div>{t("status")}: <Badge tone="neutral">{detail.status}</Badge></div>
              {detail.approvedBy?.name && <div>{t("approve")}: {detail.approvedBy.name}{detail.approvedAt ? ` · ${new Date(detail.approvedAt).toLocaleString()}` : ""}</div>}
              {detail.notes && <div>{t("notes")}: {detail.notes}</div>}
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="text-gray-500"><tr>
                  <th className="text-start p-2.5">{t("item")}</th><th className="p-2.5">{t("area")}</th>
                  <th className="p-2.5">{t("quantity")}</th><th className="p-2.5">{t("unit")}</th><th className="text-start p-2.5">{t("notes")}</th>
                </tr></thead>
                <tbody>{detail.entries.map((e: any) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="p-2.5">{name(e.item)}</td>
                    <td className="p-2.5 text-center text-xs">{t(e.item.area === "FLOOR" ? "floor" : "kitchen")}</td>
                    <td className="p-2.5 text-center font-semibold tabular-nums">{e.countedQty}</td>
                    <td className="p-2.5 text-center text-gray-500">{e.item.unit}</td>
                    <td className="p-2.5 text-gray-500">{e.note || ""}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {isManager && onAction && detail.status === "SUBMITTED" && (
              <div className="flex gap-2 flex-wrap pt-2">
                <button className="btn-primary flex-1" onClick={() => onAction(detail.id, "APPROVE")}>{t("approve")}</button>
                <button className="btn-ghost" onClick={() => onAction(detail.id, "RECOUNT")}>{t("requestRecount")}</button>
                <button className="btn-danger" onClick={() => onAction(detail.id, "REJECT")}>{t("reject")}</button>
              </div>
            )}
            <button className="btn-ghost w-full" onClick={onClose}>{t("cancel")}</button>
          </>
        )}
      </div>
    </div>
  );
}
