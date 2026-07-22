"use client";
import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, PageSpinner, Badge, EmptyState } from "@/components/ui";
import { RefreshCw, Plus, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";

// Clean, stateless-by-default Prep screen:
//  - Suggestions and tasks are ALWAYS fetched fresh from the server (which
//    computes them live from current inventory + the latest recipe).
//  - No ingredient amounts are calculated or cached on the client.
//  - reload() re-fetches everything; the Refresh button and every mutation call it.
export default function PrepPage() {
  const { t, name } = useI18n();
  const { data: session } = useSession();
  const isManager = ["MANAGER", "ADMIN"].includes((session?.user as any)?.role);

  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const [s, tk] = await Promise.all([api("/api/prep/suggestions"), api("/api/prep/tasks")]);
      setSuggestions(s);
      setTasks(tk);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function createTask(s: any) {
    await api("/api/prep/tasks", { method: "POST", body: JSON.stringify({ prepItemId: s.prepItemId, targetQty: s.produceQty, reason: s.reason }) });
    await reload();
  }
  async function complete(id: string) {
    await api(`/api/prep/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ action: "COMPLETE" }) });
    await reload();
  }
  async function removeTask(id: string) {
    if (!window.confirm(t("confirmDelete"))) return;
    await api(`/api/prep/tasks/${id}`, { method: "DELETE" });
    await reload();
  }

  if (suggestions === null) return <PageSpinner />;

  const IngredientList = ({ list }: { list: any[] }) => (
    <ul className="mt-1 space-y-1 text-sm">
      {list.map((ing: any) => (
        <li key={ing.itemId} className={`flex justify-between ${ing.shortfall > 0 ? "text-red-600 font-medium" : ""}`}>
          <span>
            {name(ing)}
            {ing.inactive && <Badge tone="danger" className="ms-1" title={t("linkedArchived")}>{t("archivedShort")}</Badge>}
          </span>
          <span className="tabular-nums">{ing.required} {ing.unit} · {t("available")}: {ing.available}{ing.shortfall > 0 ? ` · ${t("insufficient")} ${ing.shortfall}` : ""}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("prep")}</h1>
        <button className="btn-ghost text-sm" onClick={reload} disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />{t("refresh")}</button>
      </div>

      {/* Suggestions / planning — manager & admin only */}
      {isManager && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">{t("prepPlanning")} · {t("suggestedQty")}</h2>
          {suggestions.length === 0 && <Card><EmptyState label={t("noData")} /></Card>}
          {suggestions.map((s) => (
            <Card key={s.prepItemId}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{name(s)}</h3>
                  <p className="text-sm text-gray-500">{t("current")}: {s.currentQty} → {t("par")}: {s.parQty} {s.unit}</p>
                  {s.prepNeeded
                    ? <p className="text-brand-700 font-medium mt-1">{t("prepare")}: {s.produceQty} {s.unit}</p>
                    : <p className="text-emerald-700 font-medium mt-1 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />{t("noPrepNeeded")}</p>}
                </div>
                {s.prepNeeded && <button className="btn-primary text-sm" onClick={() => createTask(s)}><Plus className="h-4 w-4" />{t("prepTasks")}</button>}
              </div>
              <div className="mt-2 border-t border-gray-100 pt-2">
                <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{t("required")} ({t("inventory")}):</span>
                <IngredientList list={s.ingredients} />
                {s.prepNeeded && !s.ingredientsOk && <p className="text-amber-700 text-xs mt-1.5 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{t("missingIngredientsWarn")}</p>}
              </div>
            </Card>
          ))}
        </section>
      )}

      {/* Tasks — everyone */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">{t("prepTasks")}</h2>
        {tasks.length === 0 && <Card><EmptyState label={t("noData")} /></Card>}
        {tasks.map((tk) => (
          <Card key={tk.id}>
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div>
                <span className="font-medium text-gray-900">{name(tk.prepItem.item)}</span> — {tk.targetQty} {tk.prepItem.item.unit}
                <Badge tone="neutral" className="ms-2">{tk.status}</Badge>
                {tk.status !== "DONE" && !tk.ingredientsOk && <Badge tone="warn" className="ms-2">⚠</Badge>}
              </div>
              <div className="flex gap-2">
                {tk.status !== "DONE" && <button className="btn-primary text-sm" onClick={() => complete(tk.id)}><CheckCircle2 className="h-4 w-4" />{t("markDone")}</button>}
                {isManager && <button className="btn-ghost text-sm text-red-600" onClick={() => removeTask(tk.id)}><Trash2 className="h-3.5 w-3.5" />{t("delete")}</button>}
              </div>
            </div>
            {tk.status !== "DONE" && tk.ingredients?.length > 0 && (
              <div className="mt-2 border-t border-gray-100 pt-2">
                <span className="text-gray-500 text-xs font-semibold uppercase tracking-wide">{t("required")} ({t("inventory")}):</span>
                <IngredientList list={tk.ingredients} />
                {!tk.ingredientsOk && <p className="text-amber-700 text-xs mt-1.5 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{t("missingIngredientsWarn")}</p>}
              </div>
            )}
          </Card>
        ))}
      </section>
    </div>
  );
}
