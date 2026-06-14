"use client";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { sanitizeCountEntries } from "@/lib/count";
import { Card, Input, Spinner } from "@/components/ui";
import { CountDetailModal } from "@/components/CountDetailModal";
import { CountHistory } from "@/components/CountHistory";

export default function CountPage() {
  const { t, name } = useI18n();
  const { data: session } = useSession();
  const isManager = ["MANAGER", "ADMIN"].includes((session?.user as any)?.role);
  const [tab, setTab] = useState<"new" | "history">("new");
  const [items, setItems] = useState<any[]>([]);
  const [area, setArea] = useState<"KITCHEN" | "FLOOR">("KITCHEN");
  const [locations, setLocations] = useState<any[]>([]);
  const [scope, setScope] = useState<string>("FULL"); // "FULL" or a Location id
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [countId, setCountId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null); // count detail being reviewed

  const loadPending = () =>
    api("/api/counts").then((cs) => setPending(cs.filter((c: any) => c.status === "SUBMITTED")));

  // Full count: only count-enabled items for the selected area.
  // Location count: only count-enabled items assigned to that location (any area).
  useEffect(() => {
    const qs = scope === "FULL" ? `area=${area}` : `locationId=${scope}`;
    api(`/api/inventory?inCount=1&${qs}`).then(setItems);
  }, [area, scope]);
  useEffect(() => { loadPending(); api("/api/locations").then(setLocations); }, []);

  async function start() {
    const body = scope === "FULL" ? {} : { locationId: scope };
    const c = await api("/api/counts", { method: "POST", body: JSON.stringify(body) });
    setCountId(c.id);
  }

  const grouped = useMemo(() => {
    const filtered = items.filter((i) =>
      name(i).toLowerCase().includes(search.toLowerCase()) || i.nameHe.includes(search) || i.nameEn.toLowerCase().includes(search.toLowerCase()));
    const g: Record<string, any[]> = {};
    for (const i of filtered) {
      const cat = i.category ? name(i.category) : "—";
      (g[cat] ||= []).push(i);
    }
    return g;
  }, [items, search, name]);

  const counted = Object.keys(values).filter((k) => values[k] !== "").length;
  const progress = items.length ? Math.round((counted / items.length) * 100) : 0;

  async function submit() {
    if (!countId) return;
    setSaving(true);
    setError("");
    try {
      // Sanitize first: tolerate decimal commas, drop blanks/invalid values so we
      // never send NaN (which serializes to null and breaks the insert).
      const entries = sanitizeCountEntries(values);
      if (entries.length === 0) {
        setError(t("noData"));
        return;
      }
      await api(`/api/counts/${countId}/submit`, { method: "POST", body: JSON.stringify({ entries, notes }) });
      setSubmitted(true);
      loadPending(); // refresh manager approval list / dashboard data source
    } catch (e: any) {
      setError(e?.message || "Submit failed");
    } finally {
      setSaving(false);
    }
  }

  async function approve(id: string, action: string) {
    await api(`/api/counts/${id}/approve`, { method: "POST", body: JSON.stringify({ action }) });
    setPending((p) => p.filter((c) => c.id !== id));
    setDetail(null);
  }

  async function openDetail(id: string) {
    setDetail("loading");
    try { setDetail(await api(`/api/counts/${id}`)); }
    catch { setDetail(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">{t("dailyCount")}</h1>
        <div className="flex gap-2">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            <button onClick={() => setTab("new")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === "new" ? "bg-white shadow text-brand-700" : "text-gray-500"}`}>
              {t("newCount")}
            </button>
            {isManager && (
              <button onClick={() => setTab("history")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === "history" ? "bg-white shadow text-brand-700" : "text-gray-500"}`}>
                {t("countHistory")}
              </button>
            )}
          </div>
          {tab === "new" && !countId && (
            <div className="inline-flex rounded-xl bg-gray-100 p-1 flex-wrap">
              <button onClick={() => setScope("FULL")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium ${scope === "FULL" ? "bg-white shadow text-brand-700" : "text-gray-500"}`}>
                {t("fullCount")}
              </button>
              {locations.map((l) => (
                <button key={l.id} onClick={() => setScope(l.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium ${scope === l.id ? "bg-white shadow text-brand-700" : "text-gray-500"}`}>
                  {name(l)}
                </button>
              ))}
            </div>
          )}
          {tab === "new" && !countId && scope === "FULL" && (
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              {(["KITCHEN", "FLOOR"] as const).map((a) => (
                <button key={a} onClick={() => setArea(a)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium ${area === a ? "bg-white shadow text-brand-700" : "text-gray-500"}`}>
                  {t(a === "KITCHEN" ? "kitchen" : "floor")}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === "history" && isManager && <CountHistory />}

      {tab === "new" && isManager && pending.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-2">{t("pendingApprovals")}</h2>
          <ul className="divide-y">
            {pending.map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between gap-2 flex-wrap">
                <span>{new Date(c.businessDay).toLocaleDateString()} · {c.countedBy?.name} · {c._count?.entries} {t("item")}</span>
                <span className="flex gap-2 flex-wrap">
                  <button className="btn-primary text-sm" onClick={() => openDetail(c.id)}>{t("viewDetails")}</button>
                  <button className="btn-ghost text-sm" onClick={() => approve(c.id, "APPROVE")}>{t("approve")}</button>
                  <button className="btn-ghost text-sm" onClick={() => approve(c.id, "RECOUNT")}>{t("requestRecount")}</button>
                  <button className="btn-danger text-sm" onClick={() => approve(c.id, "REJECT")}>{t("reject")}</button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "new" && (!countId ? (
        <button className="btn-primary w-full h-14 text-lg" onClick={start}>
          {scope === "FULL" ? t("fullCount") : name(locations.find((l) => l.id === scope))} →
        </button>
      ) : submitted ? (
        <Card className="text-center space-y-3">
          <p className="text-emerald-700 font-medium text-lg">✓ {t("submit")}</p>
          <a href="/dashboard" className="btn-primary inline-flex">{t("dashboard")} →</a>
        </Card>
      ) : (
        <>
          <div className="sticky top-28 z-10 bg-gray-50 py-2 space-y-2">
            <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-sm text-gray-500">{t("progress")}: {counted}/{items.length} ({progress}%)</div>
          </div>

          {Object.entries(grouped).map(([cat, list]) => (
            <Card key={cat}>
              <h3 className="font-semibold mb-2">{cat}</h3>
              <div className="space-y-2">
                {list.map((i) => (
                  <div key={i.id} className="flex items-center gap-3">
                    <span className="flex-1">{name(i)} <span className="text-gray-400 text-sm">({i.unit})</span></span>
                    <input inputMode="decimal" className="touch-input w-28 text-center"
                      value={values[i.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [i.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </Card>
          ))}

          <Card>
            <Input placeholder={t("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>
          {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          <button className="btn-primary w-full h-14 text-lg" disabled={saving} onClick={submit}>
            {saving ? "…" : t("submit")}
          </button>
        </>
      ))}

      <CountDetailModal detail={detail} isManager={isManager} onAction={approve} onClose={() => setDetail(null)} />
    </div>
  );
}
