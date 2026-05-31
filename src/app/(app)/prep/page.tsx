"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Spinner } from "@/components/ui";

export default function PrepPage() {
  const { t, name } = useI18n();
  const { data: session } = useSession();
  const isManager = ["MANAGER", "ADMIN"].includes((session?.user as any)?.role);
  const [sugg, setSugg] = useState<any[] | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const load = () => Promise.all([api("/api/prep/suggestions"), api("/api/prep/tasks")]).then(([s, tk]) => { setSugg(s); setTasks(tk); });
  useEffect(() => { load(); }, []);

  async function createTask(s: any) {
    await api("/api/prep/tasks", { method: "POST", body: JSON.stringify({
      prepItemId: s.prepItemId, targetQty: s.produceQty, reason: s.reason,
      ingredientsOk: s.ingredientsOk, shortfallJson: JSON.stringify(s.ingredients.filter((i: any) => i.shortfall > 0)),
    }) });
    load();
  }
  async function complete(id: string) {
    await api("/api/prep/tasks", { method: "POST", body: JSON.stringify({ action: "COMPLETE", taskId: id }) });
    load();
  }
  async function removeTask(id: string) {
    if (!window.confirm(t("confirmDelete"))) return;
    await api(`/api/prep/tasks/${id}`, { method: "DELETE" });
    load();
  }

  if (!sugg) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("prep")}</h1>

      {/* Prep planning / suggestions — manager & admin only (employees view tasks). */}
      {isManager && (
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">{t("prepPlanning")} · {t("suggestedQty")}</h2>
        {sugg.length === 0 && <Card><p className="text-gray-400">{t("noData")}</p></Card>}
        {sugg.map((s) => (
          <Card key={s.prepItemId}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{name(s)}</h3>
                <p className="text-sm text-gray-500">{t("current")}: {s.currentQty} → {t("par")}: {s.parQty} {s.unit}</p>
                <p className="text-brand-700 font-medium mt-1">{t("prepare")}: {s.produceQty} {s.unit}</p>
              </div>
              <button className="btn-primary text-sm" onClick={() => createTask(s)}>
                + {t("prepTasks")}
              </button>
            </div>
            <div className="mt-2 text-sm">
              <span className="text-gray-500">{t("required")}:</span>
              <ul className="mt-1 space-y-1">
                {s.ingredients.map((ing: any) => (
                  <li key={ing.itemId} className={`flex justify-between ${ing.shortfall > 0 ? "text-red-600" : ""}`}>
                    <span>{name(ing)}</span>
                    <span>{ing.required} {ing.unit} ({t("available")}: {ing.available}{ing.shortfall > 0 ? ` · ${t("insufficient")} ${ing.shortfall}` : ""})</span>
                  </li>
                ))}
              </ul>
              {!s.ingredientsOk && <p className="text-amber-600 text-xs mt-2">⚠ {t("missingIngredientsWarn")}</p>}
            </div>
          </Card>
        ))}
      </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">{t("prepTasks")}</h2>
        {tasks.length === 0 && <Card><p className="text-gray-400">{t("noData")}</p></Card>}
        {tasks.map((tk) => (
          <Card key={tk.id} className="flex justify-between items-center">
            <div>
              <span className="font-medium">{name(tk.prepItem.item)}</span> — {tk.targetQty} {tk.prepItem.item.unit}
              <span className="badge ms-2 bg-gray-100">{tk.status}</span>
            </div>
            <div className="flex gap-2">
              {tk.status !== "DONE" && <button className="btn-primary text-sm" onClick={() => complete(tk.id)}>✓ {t("markDone")}</button>}
              {isManager && <button className="btn-ghost text-sm text-red-600" onClick={() => removeTask(tk.id)}>{t("delete")}</button>}
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
