"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useSession } from "next-auth/react";
import { api } from "@/lib/fetcher";
import { Card, Field, Input, Spinner } from "@/components/ui";

type U = { id: string; name: string; email: string; role: string; isActive: boolean };

export default function UsersPage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const myRole = (session?.user as any)?.role;
  const myId = (session?.user as any)?.id;
  const isAdmin = myRole === "ADMIN";

  const [users, setUsers] = useState<U[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "EMPLOYEE" });
  const [editing, setEditing] = useState<U | null>(null);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [error, setError] = useState("");
  const load = () => api("/api/users").then(setUsers);
  useEffect(() => { load(); }, []);

  // Admin can assign any role; manager can only create employees.
  const roleOptions = isAdmin ? ["EMPLOYEE", "MANAGER", "ADMIN"] : ["EMPLOYEE"];

  async function add() {
    setError("");
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", email: "", password: "", role: "EMPLOYEE" });
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function saveEdit() {
    if (!editing) return;
    setError("");
    const body: any = { name: editing.name, email: editing.email, role: editing.role };
    // Optional password reset.
    if (pw.next || pw.confirm) {
      if (pw.next.length < 8) { setError(t("passwordTooShort")); return; }
      if (pw.next !== pw.confirm) { setError(t("passwordsDoNotMatch")); return; }
      if (!window.confirm(t("confirmSavePassword"))) return;
      body.password = pw.next;
    }
    try {
      await api(`/api/users/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setEditing(null); setPw({ next: "", confirm: "" }); load();
    } catch (e: any) { setError(e.message); }
  }

  function openEdit(u: U) { setPw({ next: "", confirm: "" }); setError(""); setEditing(u); }

  async function setActive(u: U, isActive: boolean) {
    await api(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
    load();
  }

  async function remove(u: U) {
    if (!window.confirm(t("confirmDelete"))) return;
    try { await api(`/api/users/${u.id}`, { method: "DELETE" }); load(); }
    catch (e: any) { setError(e.message); }
  }

  // A manager may only manage EMPLOYEE accounts; admin manages everyone.
  const canManage = (u: U) => isAdmin || u.role === "EMPLOYEE";

  if (!users) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("users")}</h1>

      <Card className="space-y-3">
        <h2 className="font-semibold">{t("add")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t("email")}><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={t("password")}><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label={t("role")}>
            <select className="touch-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        {!isAdmin && <p className="text-xs text-gray-400">{t("managerCreateEmployeeOnly")}</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="btn-primary" disabled={!form.email || !form.name} onClick={add}>{t("add")}</button>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500"><tr>
            <th className="text-start p-3">Name</th><th className="text-start p-3">{t("email")}</th>
            <th className="p-3">{t("role")}</th><th className="p-3">{t("active")}</th><th className="p-3"></th>
          </tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} className={`border-t ${u.isActive ? "" : "opacity-50"}`}>
              <td className="p-3">{u.name}{u.id === myId && <span className="text-gray-400"> ({t("me")})</span>}</td>
              <td className="p-3">{u.email}</td>
              <td className="p-3 text-center"><span className="badge bg-gray-100">{u.role}</span></td>
              <td className="p-3 text-center">{u.isActive ? "✓" : "—"}</td>
              <td className="p-3">
                <div className="flex gap-2 justify-end">
                  {canManage(u) && <button className="text-brand-600" onClick={() => openEdit(u)}>{t("edit")}</button>}
                  {isAdmin && u.id !== myId && (
                    <>
                      <button className="text-amber-600" onClick={() => setActive(u, !u.isActive)}>{u.isActive ? t("deactivate") : t("activate")}</button>
                      <button className="text-red-600" onClick={() => remove(u)}>{t("delete")}</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-30" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{t("edit")}</h2>
            <Field label="Name"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label={t("email")}><Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label={t("role")}>
              <select className="touch-input" value={editing.role} disabled={!isAdmin}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                {(isAdmin ? ["EMPLOYEE", "MANAGER", "ADMIN"] : [editing.role]).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>

            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium text-gray-600">{t("resetPassword")}</p>
              <Field label={t("newPassword")}>
                <Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </Field>
              <Field label={t("confirmPassword")}>
                <Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
              </Field>
              <p className="text-xs text-gray-400">{t("passwordRule")} · {t("leaveBlankKeep")}</p>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={saveEdit}>{t("save")}</button>
              <button className="btn-ghost" onClick={() => { setEditing(null); setPw({ next: "", confirm: "" }); }}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
