"use client";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { sanitizeCountEntries } from "@/lib/count";
import { Card, Input, SearchInput, PageSpinner, EmptyState } from "@/components/ui";
import { CheckCircle2 } from "lucide-react";
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
        <h1 className="text-2xl font-bold text-gray-900">{t("dailyCount")}</h1>
        <div className="flex gap-2 flex-wrap">
          <div className="seg">
            <button onClick={() => setTab("new")} className={`seg-btn ${tab === "new" ? "is-active" : ""}`}>{t("newCount")}</button>
            {isManager && (
              <button onClick={() => setTab("history")} className={`seg-btn ${tab === "history" ? "is-active" : ""}`}>{t("countHistory")}</button>
            )}
          </div>
          {tab === "new" && !countId && (
            <div className="seg">
              <button onClick={() => setScope("FULL")} className={`seg-btn ${scope === "FULL" ? "is-active" : ""}`}>{t("fullCount")}</button>
              {locations.map((l) => (
                <button key={l.id} onClick={() => setScope(l.id)} className={`seg-btn ${scope === l.id ? "is-active" : ""}`}>{name(l)}</button>
              ))}
            </div>
          )}
          {tab === "new" && !countId && scope === "FULL" && (
            <div className="seg">
              {(["KITCHEN", "FLOOR"] as const).map((a) => (
                <button key={a} onClick={() => setArea(a)} className={`seg-btn ${area === a ? "is-active" : ""}`}>
                  {t(a === "KITCHEN" ? "kitchen" : "floor")}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === "history" && isManager && <CountHistory />}

      {tab === "new" && isManager && pending.length > 0 && (
        <Card className="tone-peach border-transparent">
          <h2 className="font-semibold mb-2">{t("pendingApprovals")}</h2>
          <ul className="divide-y divide-black/5">
            {pending.map((c) => (
              <li key={c.id} className="py-2.5 flex items-center justify-between gap-2 flex-wrap">
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
        <Card className="tone-mint border-transparent text-center space-y-3 py-8">
          <CheckCircle2 className="h-9 w-9 mx-auto text-mint-ink" />
          <p className="text-mint-ink font-semibold text-lg">{t("submit")}</p>
          <a href="/dashboard" className="btn-primary inline-flex">{t("dashboard")} →</a>
        </Card>
      ) : (
        <>
          <div className="sticky top-0 md:top-0 z-10 bg-gray-50/95 backdrop-blur py-3 space-y-2 -mx-4 px-4 md:mx-0 md:px-0">
            <SearchInput placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full transition-all duration-300 ease-soft" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-sm text-gray-500 font-medium">{t("progress")}: {counted}/{items.length} ({progress}%)</div>
          </div>

          {Object.entries(grouped).map(([cat, list]) => (
            <Card key={cat}>
              <h3 className="font-semibold mb-3">{cat}</h3>
              <div className="divide-y divide-gray-100">
                {list.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex-1">{name(i)} <span className="text-gray-400 text-sm">({i.unit})</span></span>
                    <input inputMode="decimal" className="touch-input w-28 text-center font-semibold tabular-nums"
                      value={values[i.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [i.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </Card>
          ))}

          <Card>
            <Input placeholder={t("notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Card>
          {error && <p className="text-red-600 text-sm text-center font-medium">{error}</p>}
          <button className="btn-primary w-full h-14 text-lg" disabled={saving} onClick={submit}>
            {saving ? "…" : t("submit")}
          </button>
        </>
      ))}

      <CountDetailModal detail={detail} isManager={isManager} onAction={approve} onClose={() => setDetail(null)} />
    </div>
  );
}
