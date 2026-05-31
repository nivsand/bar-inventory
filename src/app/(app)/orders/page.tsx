"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { api } from "@/lib/fetcher";
import { Card, Spinner } from "@/components/ui";

const STATUS_TONE: Record<string, string> = {
  NEED_TO_ORDER: "bg-amber-100 text-amber-800", ORDERED: "bg-blue-100 text-blue-800",
  ARRIVED: "bg-emerald-100 text-emerald-800", PARTIALLY_DELIVERED: "bg-orange-100 text-orange-800",
  MISSING_ITEMS: "bg-red-100 text-red-800", PROBLEM: "bg-red-100 text-red-800", CANCELLED: "bg-gray-100 text-gray-600",
};

function buildMessage(supplierName: string, items: any[], nameOf: (i: any) => string) {
  const lines = items.map((i) => `• ${nameOf(i)}: ${i.orderedQty} ${i.unit}`);
  return `שלום ${supplierName},\nנשמח להזמין:\n${lines.join("\n")}\nתודה!`;
}

export default function OrdersPage() {
  const { t, name } = useI18n();
  const [sugg, setSugg] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ supplier: any; text: string } | null>(null);

  const load = () => Promise.all([api("/api/orders/suggestions"), api("/api/orders")])
    .then(([s, o]) => { setSugg(s); setOrders(o);
      const q: Record<string, number> = {};
      s.bySupplier.forEach((g: any) => g.items.forEach((it: any) => { q[it.itemId] = it.suggestedQty; }));
      setQty(q); setLoading(false); });
  useEffect(() => { load(); }, []);

  async function createOrder(group: any) {
    const items = group.items.map((it: any) => ({
      itemId: it.itemId, suggestedQty: it.suggestedQty, orderedQty: qty[it.itemId] ?? it.suggestedQty,
      currentQty: it.currentQty, minQty: it.minQty, reason: it.reason, unit: it.unit,
    }));
    const order = await api("/api/orders", { method: "POST", body: JSON.stringify({ supplierId: group.supplier.id, items, channel: group.supplier.orderingMethod }) });
    const text = buildMessage(name(group.supplier), order.items.map((oi: any) => ({ ...oi, ...oi.item })), name);
    await api(`/api/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ messageBody: text, status: "ORDERED" }) });
    setMsg({ supplier: group.supplier, text });
    load();
  }

  async function setStatus(id: string, status: string) {
    await api(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    load();
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
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">{name(g.supplier)} <span className="text-gray-400 text-sm">· {g.supplier.orderingMethod}</span></h3>
              <button className="btn-primary text-sm" onClick={() => createOrder(g)}>{t("generateOrder")}</button>
            </div>
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
                    </td>
                    <td className="p-2 text-xs text-gray-500">{it.reason}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">{t("openOrders")} · {t("history")}</h2>
        {orders.map((o) => (
          <Card key={o.id}>
            <div className="flex justify-between items-center">
              <div>
                <span className="font-semibold">{name(o.supplier)}</span>
                <span className={`badge ms-2 ${STATUS_TONE[o.status]}`}>{o.status}</span>
                <p className="text-sm text-gray-400">{new Date(o.createdAt).toLocaleString()} · {o.items.length} {t("item")}</p>
              </div>
              <select className="touch-input h-10 w-auto text-sm" value={o.status} onChange={(e) => setStatus(o.id, e.target.value)}>
                {Object.keys(STATUS_TONE).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {o.messageBody && (
              <details className="mt-2"><summary className="text-brand-600 text-sm cursor-pointer">{t("copyMessage")}</summary>
                <pre className="bg-gray-50 rounded-lg p-3 text-xs whitespace-pre-wrap mt-2">{o.messageBody}</pre>
              </details>
            )}
          </Card>
        ))}
      </section>

      {msg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30 p-4" onClick={() => setMsg(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{name(msg.supplier)}</h2>
            <textarea className="w-full h-40 border rounded-xl p-3 text-sm" defaultValue={msg.text} id="ordermsg" />
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
