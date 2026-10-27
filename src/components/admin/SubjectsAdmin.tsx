"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, api } from "@/lib/api-client";
import { formatDuration } from "@/lib/format";
import type { SubjectRow } from "@/lib/services/subjects";

const POLICY_LABEL: Record<string, string> = {
  score_only: "Score only (no review)",
  correctness: "Score + right/wrong per question",
  answers: "Score + right/wrong + correct answers",
  full: "Everything, including explanations",
};

interface FormState {
  id: string | null;
  name: string;
  code: string;
  description: string;
  seconds: string;
  review_policy: string;
  per_page: string;
  shuffle: boolean;
}
const EMPTY: FormState = { id: null, name: "", code: "", description: "", seconds: "", review_policy: "full", per_page: "1", shuffle: false };

export default function SubjectsAdmin({ subjects }: { subjects: SubjectRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function edit(s: SubjectRow) {
    setOk(null); setError(null);
    setForm({
      id: s.id, name: s.name, code: s.code ?? "", description: s.description ?? "",
      seconds: s.time_per_question_seconds ? String(s.time_per_question_seconds) : "", review_policy: s.review_policy,
      per_page: String(s.questions_per_page), shuffle: s.shuffle_options,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setOk(null);
    const body = {
      name: form.name,
      code: form.code || null,
      description: form.description || null,
      time_per_question_seconds: form.seconds.trim() ? Number(form.seconds) : null,
      review_policy: form.review_policy,
      questions_per_page: Number(form.per_page) || 1,
      shuffle_options: form.shuffle,
    };
    try {
      if (form.id) await api(`/api/admin/subjects/${form.id}`, { method: "PATCH", body });
      else await api("/api/admin/subjects", { method: "POST", body });
      setOk(form.id ? "Subject updated." : "Subject created.");
      setForm(EMPTY);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? (Array.isArray(err.data?.issues) ? (err.data.issues as { path: string; message: string }[]).map((i) => `${i.path}: ${i.message}`).join(" ") : err.message) : "Could not save.");
    } finally { setBusy(false); }
  }

  async function remove(s: SubjectRow) {
    if (!window.confirm(`Delete "${s.name}"?\n\nThis permanently deletes its ${s.total_questions} question(s). Students' past attempts (${s.attempt_count}) are kept.`)) return;
    try { await api(`/api/admin/subjects/${s.id}`, { method: "DELETE" }); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete."); }
  }

  return (
    <>
      <div className="card mb-4">
        <div className="card-body">
          <h5 className="card-title">{form.id ? "Edit subject" : "Add a subject"}</h5>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          {ok && <div className="alert alert-success" role="status">{ok}</div>}
          <form onSubmit={save}>
            <div className="d-flex flex-wrap gap-3">
              <div style={{ flex: "2 1 260px" }}>
                <label className="form-label" htmlFor="s-name">Name</label>
                <input id="s-name" className="form-control" required value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="form-label" htmlFor="s-code">Code</label>
                <input id="s-code" className="form-control" value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="NET101" />
                <div className="form-text">Used to match imports.</div>
              </div>
            </div>
            <div className="mt-3">
              <label className="form-label" htmlFor="s-desc">Description (optional)</label>
              <input id="s-desc" className="form-control" value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="d-flex flex-wrap gap-3 mt-3">
              <div style={{ flex: "1 1 200px" }}>
                <label className="form-label" htmlFor="s-time">Time per question (seconds)</label>
                <input id="s-time" className="form-control" type="number" min={5} max={3600} value={form.seconds} onChange={(e) => set("seconds", e.target.value)} placeholder="blank = no time limit" />
                <div className="form-text">Attempt limit = questions × this value. Enforced by the server.</div>
              </div>
              <div style={{ flex: "2 1 280px" }}>
                <label className="form-label" htmlFor="s-review">What students can review after finishing</label>
                <select id="s-review" className="form-select" value={form.review_policy} onChange={(e) => set("review_policy", e.target.value)}>
                  {Object.entries(POLICY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label className="form-label" htmlFor="s-pp">Questions per page</label>
                <input id="s-pp" className="form-control" type="number" min={1} max={100} value={form.per_page} onChange={(e) => set("per_page", e.target.value)} />
              </div>
            </div>
            <div className="form-check mt-3">
              <input id="s-shuffle" type="checkbox" checked={form.shuffle} onChange={(e) => set("shuffle", e.target.checked)} />
              <label htmlFor="s-shuffle">Shuffle the order of answer options in each attempt</label>
            </div>
            <div className="form-text mb-3">Leave this off if any option says &quot;all of the above&quot;, &quot;both A and B&quot; or otherwise refers to other options.</div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary" type="submit" disabled={busy}>{form.id ? "Save changes" : "Add subject"}</button>
              {form.id && <button className="btn btn-secondary" type="button" onClick={() => { setForm(EMPTY); setError(null); }}>Cancel</button>}
            </div>
          </form>
        </div>
      </div>

      <div className="table-responsive">
        <table className="generaltable">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Questions</th><th>Time / question</th><th>Review</th><th>Per page</th><th>Shuffle</th><th>Attempts</th><th /></tr>
          </thead>
          <tbody>
            {subjects.length === 0 && <tr><td colSpan={9} className="text-muted">No subjects yet. Add one above, or import a JSON question bank.</td></tr>}
            {subjects.map((s) => (
              <tr key={s.id}>
                <td>{s.code ?? "-"}</td>
                <td><b>{s.name}</b></td>
                <td><Link href={`/admin/questions?subject_id=${s.id}`}>{s.available_questions} usable / {s.total_questions}</Link></td>
                <td>{s.time_per_question_seconds ? formatDuration(s.time_per_question_seconds) : "No limit"}</td>
                <td>{POLICY_LABEL[s.review_policy]}</td>
                <td>{s.questions_per_page}</td>
                <td>{s.shuffle_options ? "Yes" : "No"}</td>
                <td>{s.attempt_count}</td>
                <td className="text-nowrap">
                  <a className="btn btn-sm btn-outline-secondary me-1" href={`/api/admin/subjects/${s.id}/export`} download={`${s.name}.json`}>Download JSON</a>
                  <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => edit(s)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(s)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
