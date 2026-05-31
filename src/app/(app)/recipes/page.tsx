"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { api } from "@/lib/fetcher";
import { Card, Field, Input, Spinner } from "@/components/ui";

type Line = { itemId: string; qtyPerYield: string; unit: string };

export default function RecipesPage() {
  const { t, name } = useI18n();
  const [preps, setPreps] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [yieldQty, setYieldQty] = useState("1");
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => api("/api/recipes").then((d) => { setPreps(d); setLoading(false); });
  useEffect(() => { load(); api("/api/inventory").then(setItems); }, []);

  function openEdit(p: any) {
    setEditing(p);
    setYieldQty(String(p.yieldQty ?? 1));
    setLines((p.recipe?.ingredients ?? []).map((ri: any) => ({ itemId: ri.itemId, qtyPerYield: String(ri.qtyPerYield), unit: ri.unit })));
  }
  const addLine = () => setLines((l) => [...l, { itemId: "", qtyPerYield: "", unit: "" }]);
  const setLine = (i: number, patch: Partial<Line>) => setLines((l) => l.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));

  function pickItem(i: number, itemId: string) {
    const it = items.find((x) => x.id === itemId);
    setLine(i, { itemId, unit: lines[i].unit || it?.unit || "" });
  }

  async function save() {
    const ingredients = lines.filter((l) => l.itemId && l.qtyPerYield !== "").map((l) => ({ itemId: l.itemId, qtyPerYield: Number(l.qtyPerYield), unit: l.unit || "unit" }));
    await api(`/api/recipes/${editing.id}`, { method: "PATCH", body: JSON.stringify({ yieldQty: Number(yieldQty) || 1, ingredients }) });
    setEditing(null); load();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("recipes")}</h1>
      <p className="text-sm text-gray-500">{t("prep")}</p>

      <div className="grid md:grid-cols-2 gap-3">
        {preps.map((p) => (
          <Card key={p.id}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{name(p.item)}</h3>
                <p className="text-sm text-gray-500">{t("yield")}: {p.yieldQty} {p.item.unit} · {(p.recipe?.ingredients?.length ?? 0)} {t("ingredient")}</p>
              </div>
              <button className="text-brand-600 text-sm" onClick={() => openEdit(p)}>{t("edit")}</button>
            </div>
            <ul className="mt-2 text-sm text-gray-600">
              {(p.recipe?.ingredients ?? []).map((ri: any) => (
                <li key={ri.id} className="flex justify-between"><span>{name(ri.item)}</span><span>{ri.qtyPerYield} {ri.unit}</span></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-30" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{t("recipe")}: {name(editing.item)}</h2>
            <Field label={`${t("yield")} (${editing.item.unit})`}><Input type="number" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} /></Field>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-600">{t("ingredient")}</p>
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select className="touch-input h-11 flex-1" value={l.itemId} onChange={(e) => pickItem(i, e.target.value)}>
                    <option value="">—</option>
                    {items.filter((it) => it.id !== editing.itemId).map((it) => <option key={it.id} value={it.id}>{name(it)}</option>)}
                  </select>
                  <input className="touch-input h-11 w-20 text-center" type="number" placeholder={t("quantity")} value={l.qtyPerYield} onChange={(e) => setLine(i, { qtyPerYield: e.target.value })} />
                  <input className="touch-input h-11 w-16 text-center" placeholder={t("unit")} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                  <button className="text-red-600 px-2" onClick={() => removeLine(i)} aria-label={t("remove")}>✕</button>
                </div>
              ))}
              <button className="btn-ghost text-sm" onClick={addLine}>+ {t("addIngredient")}</button>
            </div>

            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={save}>{t("save")}</button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
