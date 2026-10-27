"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, api } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { UserListRow } from "@/lib/services/users";

const TZ = "Asia/Kuala_Lumpur";

export default function UsersAdmin({ users, meId }: { users: UserListRow[]; meId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student" });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");

  const message = (e: unknown) =>
    e instanceof ApiClientError ? (Array.isArray(e.data?.issues) ? (e.data.issues as { message: string }[]).map((i) => i.message).join(" ") : e.message) : "Something went wrong.";

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(null);
    try {
      await api("/api/admin/users", { body: form });
      setOk(`Account created for ${form.email}.`);
      setForm({ name: "", email: "", password: "", role: "student" });
      router.refresh();
    } catch (err) { setError(message(err)); }
  }
  async function patch(id: string, body: Record<string, unknown>, done: string) {
    setError(null); setOk(null);
    try { await api(`/api/admin/users/${id}`, { method: "PATCH", body }); setOk(done); setResetFor(null); setNewPw(""); router.refresh(); }
    catch (err) { setError(message(err)); }
  }

  return (
    <>
      <div className="card mb-4">
        <div className="card-body">
          <h5 className="card-title">Add a user</h5>
          <form onSubmit={create} className="toolbar" style={{ marginBottom: 0 }}>
            <div><label className="form-label" htmlFor="u-name">Name</label><input id="u-name" className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="form-label" htmlFor="u-email">E-mail</label><input id="u-email" className="form-control" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="form-label" htmlFor="u-pw">Temporary password</label><input id="u-pw" className="form-control" type="text" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div>
              <label className="form-label" htmlFor="u-role">Role</label>
              <select id="u-role" className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="student">Student</option><option value="admin">Administrator</option>
              </select>
            </div>
            <button className="btn btn-primary" type="submit">Create account</button>
          </form>
        </div>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {ok && <div className="alert alert-success" role="status">{ok}</div>}
      <div className="table-responsive">
        <table className="generaltable">
          <thead><tr><th>Name</th><th>E-mail</th><th>Role</th><th>Account</th><th>Attempts</th><th>Last attempt</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role === "admin" ? <span className="badge badge-info">Administrator</span> : "Student"}</td>
                <td>{u.active ? "Active" : <span className="text-warning">Deactivated</span>}</td>
                <td>{u.attempt_count > 0 ? <Link href={`/admin/attempts?user_id=${u.id}`}>{u.attempt_count}</Link> : 0}</td>
                <td>{u.last_attempt_at ? formatDateTime(u.last_attempt_at, TZ) : "-"}</td>
                <td>
                  {resetFor === u.id ? (
                    <form className="d-flex gap-1" onSubmit={(e) => { e.preventDefault(); void patch(u.id, { password: newPw }, `Password changed for ${u.email}.`); }}>
                      <input className="form-control form-control-sm" style={{ width: 160 }} placeholder="New password" minLength={8} required value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                      <button className="btn btn-sm btn-primary" type="submit">Save</button>
                      <button className="btn btn-sm btn-secondary" type="button" onClick={() => setResetFor(null)}>Cancel</button>
                    </form>
                  ) : (
                    <span className="text-nowrap">
                      <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => { setResetFor(u.id); setNewPw(""); }}>Reset password</button>
                      {u.id !== meId && (
                        <>
                          <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => patch(u.id, { role: u.role === "admin" ? "student" : "admin" }, `${u.email} is now ${u.role === "admin" ? "a student" : "an administrator"}.`)}>
                            {u.role === "admin" ? "Make student" : "Make admin"}
                          </button>
                          <button className="btn btn-sm btn-outline-secondary" onClick={() => patch(u.id, { active: !u.active }, `${u.email} ${u.active ? "deactivated" : "reactivated"}.`)}>
                            {u.active ? "Deactivate" : "Reactivate"}
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
