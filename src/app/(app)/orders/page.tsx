"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, PageSpinner, Badge, EmptyState } from "@/components/ui";
import { Plus } from "lucide-react";
import { computeCycleStart } from "@/server/engines/ordering";
import { ORDER_STATUS_ORDER, calculateOrderValue, fmtMoney } from "@/lib/orders";

const STATUS_TONE: Record<string, "warn" | "info" | "ok" | "danger" | "neutral"> = {
  NEED_TO_ORDER: "warn", ORDERED: "info",
  ARRIVED: "ok", PARTIALLY_DELIVERED: "warn",
  MISSING_ITEMS: "danger", PROBLEM: "danger", CANCELLED: "neutral",
};
const OPEN_ORDER_STATUSES = new Set(["NEED_TO_ORDER", "ORDERED", "PARTIALLY_DELIVERED"]);

type Named = { nameHe?: string | null; nameEn?: string | null };
type MsgItem = Named & {
  orderedQty: number;
  unit: string;
  unitsPerOrderUnit?: number | null;
  orderUnitNameHe?: string | null;
  orderUnitNameEn?: string | null;
  messageUnitHe?: string | null;
  messageUnitEn?: string | null;
  showBaseQuantityInMessage?: boolean | null;
};

function qtyLabel(lang: string, i: MsgItem): string {
  const upo = i.unitsPerOrderUnit && i.unitsPerOrderUnit > 0 ? i.unitsPerOrderUnit : null;
  const baseLabel = (lang === "en" ? i.messageUnitEn : i.messageUnitHe) || i.unit;
  if (upo) {
    const orderUnits = Math.ceil(i.orderedQty / upo);
    const orderUnitName = (lang === "en" ? i.orderUnitNameEn : i.orderUnitNameHe) || (lang === "en" ? "unit" : "יחידה");
    if (i.showBaseQuantityInMessage) {
      return `${orderUnits} ${orderUnitName} (${i.orderedQty} ${baseLabel})`;
    }
    return `${orderUnits} ${orderUnitName}`;
  }
  return `${i.orderedQty} ${baseLabel}`;
}

function buildMessage(lang: string, supplier: Named, items: MsgItem[]) {
  const pick = (e: Named) => (lang === "en" ? e.nameEn || e.nameHe : e.nameHe || e.nameEn) || "";
  const lines = items.map((i) => `• ${pick(i)}: ${qtyLabel(lang, i)}`).join("\n");
  if (lang === "en") return `Hi ${pick(supplier)},\nWe'd like to order:\n${lines}\nThank you!`;
  return `שלום ${pick(supplier)},\nנשמח להזמין:\n${lines}\nתודה רבה!`;
}

function mapItems(items: any[]): MsgItem[] {
  return items.map((oi) => ({
    nameHe: oi.item.nameHe, nameEn: oi.item.nameEn, orderedQty: oi.orderedQty, unit: oi.unit,
    unitsPerOrderUnit: oi.item.unitsPerOrderUnit, orderUnitNameHe: oi.item.orderUnitNameHe, orderUnitNameEn: oi.item.orderUnitNameEn,
    messageUnitHe: oi.item.messageUnitHe, messageUnitEn: oi.item.messageUnitEn,
    showBaseQuantityInMessage: oi.item.showBaseQuantityInMessage,
  }));
}

function suggestionOrderValue(group: any, qty: Record<string, number>) {
  return (group.items || []).reduce((sum: number, item: any) => {
    const orderedQty = Number(qty[item.itemId] ?? item.suggestedQty ?? 0) || 0;
    return sum + orderedQty * (Number(item.purchasePrice ?? 0) || 0);
  }, 0);
}

function minimumReached(value: number, minimum: number | null | undefined) {
  return minimum == null || value >= minimum;
}

export default function OrdersPage() {
  const { t, name, locale } = useI18n();
  const { data: session } = useSession();
  const isManager = ["MANAGER", "ADMIN"].includes((session?.user as any)?.role);

  const [sugg, setSugg] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ supplier: any; text: string } | null>(null);
  const [addTo, setAddTo] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<{ itemId: string; qty: string }>({ itemId: "", qty: "" });
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const load = () => Promise.all([api("/api/orders/suggestions"), api("/api/orders"), api("/api/inventory")])
    .then(([s, o, inv]) => {
      setSugg(s); setOrders(o); setInventory(inv);
      const q: Record<string, number> = {};
      s.bySupplier.forEach((g: any) => g.items.forEach((it: any) => { q[it.itemId] = it.suggestedQty; }));
      setQty(q); setLoading(false);
    });
  useEffect(() => { load(); }, []);

  function toggleOrderExpand(id: string) {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Creates the order record only — does NOT open the message modal.
  async function createOrder(group: any) {
    if (!group.items.length) return;
    const items = group.items.map((it: any) => ({
      itemId: it.itemId, suggestedQty: it.suggestedQty, orderedQty: qty[it.itemId] ?? it.suggestedQty,
      currentQty: it.currentQty, minQty: it.minQty, reason: it.reason, unit: it.unit,
    }));
    const order = await api("/api/orders", { method: "POST", body: JSON.stringify({ supplierId: group.supplier.id, items, channel: group.supplier.orderingMethod }) });
    const text = buildMessage(locale, group.supplier, mapItems(order.items));
    await api(`/api/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ messageBody: text }) });
    load();
  }

  // Builds a supplier message from current suggestions — does NOT create an order.
  function createMessage(group: any) {
    if (!group.items.length) return;
    const msgItems: MsgItem[] = group.items.map((it: any) => ({
      nameHe: it.nameHe, nameEn: it.nameEn,
      orderedQty: qty[it.itemId] ?? it.suggestedQty,
      unit: it.unit,
      unitsPerOrderUnit: it.unitsPerOrderUnit,
      orderUnitNameHe: it.orderUnitNameHe,
      orderUnitNameEn: it.orderUnitNameEn,
      messageUnitHe: it.messageUnitHe,
      messageUnitEn: it.messageUnitEn,
      showBaseQuantityInMessage: it.showBaseQuantityInMessage,
    }));
    const text = buildMessage(locale, group.supplier, msgItems);
    setMsg({ supplier: group.supplier, text });
  }

  async function markSent(id: string) {
    await api(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status: "ORDERED" }) });
    load();
  }

  function openMessage(o: any) {
    const text = o.messageBody || buildMessage(locale, o.supplier, mapItems(o.items));
    setMsg({ supplier: o.supplier, text });
  }

  async function setStatus(id: string, status: string) {
    await api(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
  }

  async function addItem(orderId: string) {
    if (!addForm.itemId || !addForm.qty) return;
    await api(`/api/orders/${orderId}`, { method: "PATCH", body: JSON.stringify({ addItems: [{ itemId: addForm.itemId, orderedQty: Number(addForm.qty) }] }) });
    setAddTo(null); setAddForm({ itemId: "", qty: "" }); load();
  }

  async function notToday(supplierId: string) {
    await api("/api/orders/suggestions/not-today", { method: "POST", body: JSON.stringify({ supplierId }) });
    load();
  }

  function addSuggestedProduct(supplierId: string, item: any) {
    setSugg((prev: any) => ({
      ...prev,
      bySupplier: prev.bySupplier.map((group: any) => {
        if (group.supplier.id !== supplierId || group.items.some((it: any) => it.itemId === item.itemId)) return group;
        return {
          ...group,
          items: [...group.items, item],
          topUpSuggestions: (group.topUpSuggestions || []).filter((it: any) => it.itemId !== item.itemId),
        };
      }),
    }));
    setQty((q) => ({ ...q, [item.itemId]: item.suggestedQty }));
  }

  async function deleteOrder(id: string, isSent: boolean) {
    if (!window.confirm(isSent ? t("confirmCancelOrder") : t("confirmDeleteOrder"))) return;
    try { await api(`/api/orders/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { alert(e.message); }
  }

  if (loading) return <PageSpinner />;

  const orderSections = {
    open: { key: "open", labelKey: "openOrders" as const, list: orders.filter((o) => OPEN_ORDER_STATUSES.has(o.status)) },
    history: { key: "history", labelKey: "history" as const, list: orders.filter((o) => !OPEN_ORDER_STATUSES.has(o.status)) },
  };

  const renderOrderSection = (sectionDef: typeof orderSections.open | typeof orderSections.history) => (
    <section key={sectionDef.key} className="space-y-3">
      <h2 className="font-semibold text-lg">{t(sectionDef.labelKey)} ({sectionDef.list.length})</h2>
      {sectionDef.list.length === 0 && <Card><EmptyState label={t("noData")} /></Card>}
      {sectionDef.list.map((o) => {
        const isOpen = o.status === "NEED_TO_ORDER";
        const editable = o.status !== "CANCELLED" && o.status !== "ARRIVED";
        const expanded = expandedOrders.has(o.id);
        return (
          <Card key={o.id}>
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div>
                <span className="font-semibold text-gray-900">{name(o.supplier)}</span>
                <Badge tone={STATUS_TONE[o.status] ?? "neutral"} className="ms-2">{o.status}</Badge>
                <div className={`text-sm font-semibold mt-1 ${minimumReached(o.currentOrderValue ?? calculateOrderValue(o.items), o.supplierMinimum ?? o.supplier?.minOrderAmount) ? "text-emerald-700" : "text-amber-700"}`}>
                  {fmtMoney(o.currentOrderValue ?? calculateOrderValue(o.items), locale)} / {(o.supplierMinimum ?? o.supplier?.minOrderAmount) == null ? t("noMinimumOrder") : fmtMoney(o.supplierMinimum ?? o.supplier.minOrderAmount, locale)}
                </div>
                <p className="text-sm text-gray-400">
                  {new Date(o.createdAt).toLocaleString()} · {o.items.length} {t("item")}
                  {o.createdBy?.name && <> · {o.createdBy.name}</>}
                  {o.sentAt && <> · {t("markAsSent")}: {new Date(o.sentAt).toLocaleString()}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isManager && isOpen && <button className="btn-primary text-sm" onClick={() => markSent(o.id)}>{t("markAsSent")}</button>}
                <select className="touch-input h-10 w-auto text-sm" value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}>
                  {ORDER_STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {isManager && <button className="text-red-600 text-sm" onClick={() => deleteOrder(o.id, !isOpen)}>{isOpen ? t("delete") : t("cancelOrder")}</button>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-2 items-center">
              <button className="text-brand-600 text-sm" onClick={() => toggleOrderExpand(o.id)}>
                {expanded ? t("hideProducts") : `${t("showProducts")} (${o.items.length})`}
              </button>
              <button className="text-brand-600 text-sm" onClick={() => openMessage(o)}>{t("copyMessage")}</button>
              {isManager && editable && (
                addTo === o.id ? (
                  <span className="flex flex-wrap gap-2 items-center">
                    <select className="touch-input h-10 w-auto text-sm" value={addForm.itemId} onChange={(e) => setAddForm({ ...addForm, itemId: e.target.value })}>
                      <option value="">—</option>
                      {inventory
                        .filter((i) => i.supplierId === o.supplierId && !o.items.some((oi: any) => oi.itemId === i.id))
                        .map((i) => <option key={i.id} value={i.id}>{name(i)}</option>)}
                    </select>
                    <input className="touch-input h-10 w-20 text-center" type="number" placeholder={t("quantity")} value={addForm.qty} onChange={(e) => setAddForm({ ...addForm, qty: e.target.value })} />
                    <button className="btn-primary text-sm" onClick={() => addItem(o.id)} disabled={!addForm.itemId || !addForm.qty}>{t("add")}</button>
                    <button className="btn-ghost text-sm" onClick={() => { setAddTo(null); setAddForm({ itemId: "", qty: "" }); }}>{t("cancel")}</button>
                  </span>
                ) : (
                  <button className="btn-ghost text-sm" onClick={() => { setAddTo(o.id); setAddForm({ itemId: "", qty: "" }); }}><Plus className="h-3.5 w-3.5" />{t("addProduct")}</button>
                )
              )}
            </div>

            {expanded && (
              <ul className="mt-2 text-sm text-gray-600 border-t pt-2">
                {o.items.map((oi: any) => (
                  <li key={oi.id} className="flex justify-between py-0.5"><span>{name(oi.item)}</span><span>{oi.orderedQty} {oi.unit}</span></li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </section>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t("orders")}</h1>

      {renderOrderSection(orderSections.open)}

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">{t("suggestedQty")} · {t("generateOrder")}</h2>
        {(() => {
          const today = new Date();
          const pending = sugg.bySupplier.filter((g: any) => {
            const cycleStart = computeCycleStart(today, g.supplier.orderDeadlineDays ?? []);
            return !orders.some((o: any) =>
              o.supplier?.id === g.supplier.id && o.status !== "CANCELLED" && new Date(o.createdAt) >= cycleStart
            );
          });
          return <>
            {pending.length === 0 && <Card><EmptyState label={t("noData")} /></Card>}
            {pending.map((g: any) => {
              const currentValue = suggestionOrderValue(g, qty);
              const minAmount = g.supplier.minOrderAmount ?? g.supplierMinimum ?? null;
              const met = minimumReached(currentValue, minAmount);
              return (
              <Card key={g.supplier.id}>
                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="font-semibold">{name(g.supplier)} <span className="text-gray-400 text-sm">· {g.supplier.orderingMethod}</span></h3>
                    <div className={`text-sm font-semibold mt-1 ${met ? "text-emerald-700" : "text-amber-700"}`}>
                      {fmtMoney(currentValue, locale)} / {minAmount == null ? t("noMinimumOrder") : `${fmtMoney(minAmount, locale)} ${t("minimum")}`}
                    </div>
                    {!met && <p className="text-xs text-amber-700 mt-0.5">{t("minimumNotMet")}</p>}
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    {g.items.length > 0 && isManager && (
                      <>
                        <button className="btn-ghost text-sm" onClick={() => createMessage(g)}>{t("createMessage")}</button>
                        <button className="btn-primary text-sm" onClick={() => createOrder(g)}>{t("generateOrder")}</button>
                      </>
                    )}
                    {isManager && <button className="btn-ghost text-sm" onClick={() => notToday(g.supplier.id)}>{t("notToday")}</button>}
                  </div>
                </div>
                {g.items.length === 0 ? (
                  <p className="text-sm text-gray-400">{t("noItemsToOrderToday")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-gray-500"><tr>
                        <th className="text-start p-2">{t("item")}</th><th className="p-2">{t("current")}</th>
                        <th className="p-2">{t("min")}</th><th className="p-2">{t("suggestedQty")}</th><th className="text-start p-2">{t("reason")}</th>
                      </tr></thead>
                      <tbody>{g.items.map((it: any) => (
                        <tr key={it.itemId} className="border-t">
                          <td className="p-2">{name(it)}</td>
                          <td className="p-2 text-center">{it.currentQty} {it.unit}</td>
                          <td className="p-2 text-center text-gray-500">{it.minQty}</td>
                          <td className="p-2 text-center">
                            <input className="touch-input h-10 w-20 text-center" type="number"
                              value={qty[it.itemId] ?? it.suggestedQty} onChange={(e) => setQty((q) => ({ ...q, [it.itemId]: Number(e.target.value) }))} />
                            {it.orderUnitQty && it.unitsPerOrderUnit ? (
                              <div className="text-[11px] text-brand-700 mt-0.5">
                                {Math.ceil((qty[it.itemId] ?? it.suggestedQty) / it.unitsPerOrderUnit)} {(locale === "en" ? it.orderUnitNameEn : it.orderUnitNameHe) || ""}
                              </div>
                            ) : null}
                          </td>
                          <td className="p-2 text-xs text-gray-500">{it.reason}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                {!met && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-800">{t("additionalSameSupplierSuggestions")}</p>
                    {(g.topUpSuggestions || []).length === 0 ? (
                      <p className="text-xs text-amber-700 mt-1">{t("noAdditionalSupplierSuggestions")}</p>
                    ) : (
                      <ul className="mt-2 divide-y divide-amber-100 text-sm">
                        {g.topUpSuggestions.map((it: any) => (
                          <li key={it.itemId} className="py-2 flex flex-wrap justify-between gap-2 items-center">
                            <span>
                              <span className="font-medium">{name(it)}</span>
                              <span className="text-amber-700 text-xs"> · {it.suggestedQty} {it.unit} · {fmtMoney(it.estimatedLineValue || it.suggestedQty * it.purchasePrice, locale)}</span>
                            </span>
                            <button className="btn-ghost text-xs" onClick={() => addSuggestedProduct(g.supplier.id, it)}>{t("add")}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
              );
            })}
          </>;
        })()}
      </section>

      {renderOrderSection(orderSections.history)}

      {msg && (
        <div className="modal-overlay" onClick={() => setMsg(null)}>
          <div className="modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900">{name(msg.supplier)}</h2>
            <textarea className="w-full h-40 border border-gray-200 rounded-xl p-3 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none" defaultValue={msg.text} id="ordermsg" dir="auto" />
            <div className="flex gap-2 flex-wrap">
              {msg.supplier.whatsapp && (
                <a className="btn-primary" target="_blank" rel="noreferrer"
                  href={`https://wa.me/${msg.supplier.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg.text)}`}>{t("whatsapp")}</a>
              )}
              {msg.supplier.email && (
                <a className="btn-ghost" href={`mailto:${msg.supplier.email}?subject=${encodeURIComponent("Order")}&body=${encodeURIComponent(msg.text)}`}>Email</a>
              )}
              <button className="btn-ghost" onClick={() => { navigator.clipboard.writeText((document.getElementById("ordermsg") as HTMLTextAreaElement).value); }}>{t("copyMessage")}</button>
              <button className="btn-ghost" onClick={() => setMsg(null)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
