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
  // editing = existing prepItem | "new" for create | null
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ nameHe: "", nameEn: "", unit: "kg", area: "KITCHEN", yieldQty: "1" });
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => api("/api/recipes").then((d) => { setPreps(d); setLoading(false); });
  useEffect(() => { load(); api("/api/inventory").then(setItems); }, []);

  function openNew() {
    setEditing("new");
    setForm({ nameHe: "", nameEn: "", unit: "kg", area: "KITCHEN", yieldQty: "1" });
    setLines([]);
  }
  function openEdit(p: any) {
    setEditing(p);
    setForm({ nameHe: p.item.nameHe, nameEn: p.item.nameEn, unit: p.item.unit, area: p.item.area || "KITCHEN", yieldQty: String(p.yieldQty ?? 1) });
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
    const excludeId = editing === "new" ? "" : editing.itemId;
    const ingredients = lines.filter((l) => l.itemId && l.qtyPerYield !== "" && l.itemId !== excludeId)
      .map((l) => ({ itemId: l.itemId, qtyPerYield: Number(l.qtyPerYield), unit: l.unit || "unit" }));
    if (editing === "new") {
      await api("/api/recipes", { method: "POST", body: JSON.stringify({
        nameHe: form.nameHe, nameEn: form.nameEn, unit: form.unit, area: form.area, yieldQty: Number(form.yieldQty) || 1, ingredients,
      }) });
    } else {
      await api(`/api/recipes/${editing.id}`, { method: "PATCH", body: JSON.stringify({ yieldQty: Number(form.yieldQty) || 1, ingredients }) });
    }
    setEditing(null); load();
  }

  async function remove(p: any) {
    if (!window.confirm(t("confirmArchiveRecipe"))) return;
    await api(`/api/recipes/${p.id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  const creating = editing === "new";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("recipes")}</h1>
        <button className="btn-primary" onClick={openNew}>+ {t("createRecipe")}</button>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {preps.map((p) => (
          <Card key={p.id}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{name(p.item)} <span className="badge bg-gray-100 ms-1">{t("prep")}</span></h3>
                <p className="text-sm text-gray-500">{t("yield")}: {p.yieldQty} {p.item.unit} · {(p.recipe?.ingredients?.length ?? 0)} {t("ingredient")}</p>
              </div>
              <div className="flex gap-3">
                <button className="text-brand-600 text-sm" onClick={() => openEdit(p)}>{t("edit")}</button>
                <button className="text-red-600 text-sm" onClick={() => remove(p)}>{t("delete")}</button>
              </div>
            </div>
            <ul className="mt-2 text-sm text-gray-600">
              {(p.recipe?.ingredients ?? []).map((ri: any) => (
                <li key={ri.id} className="flex justify-between"><span>{name(ri.item)}</span><span>{ri.qtyPerYield} {ri.unit}</span></li>
              ))}
            </ul>
          </Card>
        ))}
        {preps.length === 0 && <Card><p className="text-gray-400">{t("noData")}</p></Card>}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-30" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{creating ? t("createRecipe") : `${t("recipe")}: ${name(editing.item)}`}</h2>

            <div className="grid grid-cols-2 gap-3">
              <Field label="שם עברית"><Input value={form.nameHe} disabled={!creating} onChange={(e) => setForm({ ...form, nameHe: e.target.value })} /></Field>
              <Field label="Name (EN)"><Input value={form.nameEn} disabled={!creating} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></Field>
              <Field label={t("unit")}><Input value={form.unit} disabled={!creating} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
              {creating && (
                <Field label={t("area")}>
                  <select className="touch-input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                    <option value="KITCHEN">{t("kitchen")}</option><option value="FLOOR">{t("floor")}</option>
                  </select>
                </Field>
              )}
              <Field label={`${t("yield")} (${form.unit})`}><Input type="number" value={form.yieldQty} onChange={(e) => setForm({ ...form, yieldQty: e.target.value })} /></Field>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-600">{t("ingredient")}</p>
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select className="touch-input h-11 flex-1" value={l.itemId} onChange={(e) => pickItem(i, e.target.value)}>
                    <option value="">—</option>
                    {items.filter((it) => creating || it.id !== editing.itemId).map((it) => <option key={it.id} value={it.id}>{name(it)}</option>)}
                  </select>
                  <input className="touch-input h-11 w-20 text-center" type="number" placeholder={t("quantity")} value={l.qtyPerYield} onChange={(e) => setLine(i, { qtyPerYield: e.target.value })} />
                  <input className="touch-input h-11 w-16 text-center" placeholder={t("unit")} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                  <button className="text-red-600 px-2" onClick={() => removeLine(i)} aria-label={t("remove")}>✕</button>
                </div>
              ))}
              <button className="btn-ghost text-sm" onClick={addLine}>+ {t("addIngredient")}</button>
            </div>

            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={save} disabled={creating && (!form.nameHe || !form.nameEn)}>{t("save")}</button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
