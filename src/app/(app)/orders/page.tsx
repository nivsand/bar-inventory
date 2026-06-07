"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Spinner } from "@/components/ui";

const STATUS_TONE: Record<string, string> = {
  NEED_TO_ORDER: "bg-amber-100 text-amber-800", ORDERED: "bg-blue-100 text-blue-800",
  ARRIVED: "bg-emerald-100 text-emerald-800", PARTIALLY_DELIVERED: "bg-orange-100 text-orange-800",
  MISSING_ITEMS: "bg-red-100 text-red-800", PROBLEM: "bg-red-100 text-red-800", CANCELLED: "bg-gray-100 text-gray-600",
};

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
  if (upo) {
    const orderUnits = Math.ceil(i.orderedQty / upo);
    const unitName = (lang === "en" ? i.orderUnitNameEn : i.orderUnitNameHe) || (lang === "en" ? "unit" : "יחידה");
    if (i.showBaseQuantityInMessage) {
      return `${orderUnits} ${unitName} (${i.orderedQty} ${i.unit})`;
    }
    return `${orderUnits} ${unitName}`;
  }
  // No order unit — use message-specific unit name if set, otherwise base unit
  const displayUnit = (lang === "en" ? i.messageUnitEn : i.messageUnitHe) || i.unit;
  return `${i.orderedQty} ${displayUnit}`;
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

  async function deleteOrder(id: string) {
    if (!window.confirm(t("confirmDeleteOrder"))) return;
    try { await api(`/api/orders/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { alert(e.message); }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("orders")}</h1>

      <section className="space-y-4">
        <h2 className="font-semibold text-lg">{t("suggestedQty")} · {t("generateOrder")}</h2>
        {sugg.bySupplier.length === 0 && <Card><p className="text-gray-400">{t("noData")}</p></Card>}
        {sugg.bySupplier.map((g: any) => (
          <Card key={g.supplier.id}>
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <h3 className="font-semibold">{name(g.supplier)} <span className="text-gray-400 text-sm">· {g.supplier.orderingMethod}</span></h3>
              <div className="flex gap-2">
                {g.items.length > 0 && isManager && (
                  <>
                    <button className="btn-ghost text-sm" onClick={() => createMessage(g)}>{t("createMessage")}</button>
                    <button className="btn-primary text-sm" onClick={() => createOrder(g)}>{t("generateOrder")}</button>
                  </>
                )}
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
          </Card>
        ))}
      </section>

      {[
        { key: "open", labelKey: "openOrders" as const, list: orders.filter((o) => o.status === "NEED_TO_ORDER") },
        { key: "sent", labelKey: "sentOrders" as const, list: orders.filter((o) => o.status !== "NEED_TO_ORDER") },
      ].map((sectionDef) => (
        <section key={sectionDef.key} className="space-y-3">
          <h2 className="font-semibold text-lg">{t(sectionDef.labelKey)} ({sectionDef.list.length})</h2>
          {sectionDef.list.length === 0 && <Card><p className="text-gray-400">{t("noData")}</p></Card>}
          {sectionDef.list.map((o) => {
            const isOpen = o.status === "NEED_TO_ORDER";
            const editable = o.status !== "CANCELLED" && o.status !== "ARRIVED";
            const expanded = expandedOrders.has(o.id);
            return (
              <Card key={o.id}>
                <div className="flex justify-between items-center gap-2 flex-wrap">
                  <div>
                    <span className="font-semibold">{name(o.supplier)}</span>
                    <span className={`badge ms-2 ${STATUS_TONE[o.status]}`}>{o.status}</span>
                    <p className="text-sm text-gray-400">
                      {new Date(o.createdAt).toLocaleString()} · {o.items.length} {t("item")}
                      {o.createdBy?.name && <> · {o.createdBy.name}</>}
                      {o.sentAt && <> · {t("markAsSent")}: {new Date(o.sentAt).toLocaleString()}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isManager && isOpen && <button className="btn-primary text-sm" onClick={() => markSent(o.id)}>{t("markAsSent")}</button>}
                    <select className="touch-input h-10 w-auto text-sm" value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}>
                      {Object.keys(STATUS_TONE).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {isManager && <button className="text-red-600 text-sm" onClick={() => deleteOrder(o.id)}>{t("delete")}</button>}
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
                          {inventory.map((i) => <option key={i.id} value={i.id}>{name(i)}</option>)}
                        </select>
                        <input className="touch-input h-10 w-20 text-center" type="number" placeholder={t("quantity")} value={addForm.qty} onChange={(e) => setAddForm({ ...addForm, qty: e.target.value })} />
                        <button className="btn-primary text-sm" onClick={() => addItem(o.id)} disabled={!addForm.itemId || !addForm.qty}>{t("add")}</button>
                        <button className="btn-ghost text-sm" onClick={() => { setAddTo(null); setAddForm({ itemId: "", qty: "" }); }}>{t("cancel")}</button>
                      </span>
                    ) : (
                      <button className="btn-ghost text-sm" onClick={() => { setAddTo(o.id); setAddForm({ itemId: "", qty: "" }); }}>+ {t("addProduct")}</button>
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
      ))}

      {msg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30 p-4" onClick={() => setMsg(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{name(msg.supplier)}</h2>
            <textarea className="w-full h-40 border rounded-xl p-3 text-sm" defaultValue={msg.text} id="ordermsg" dir="auto" />
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
