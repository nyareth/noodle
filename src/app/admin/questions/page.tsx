import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import DeleteQuestionButton from "@/components/admin/DeleteQuestionButton";
import { first, toInt } from "@/lib/page-utils";
import { listQuestions } from "@/lib/services/questions";
import { listSubjects } from "@/lib/services/subjects";

const PER_PAGE = 25;

export default async function AdminQuestionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const subjectId = first(sp.subject_id) ?? "";
  const q = (first(sp.q) ?? "").trim();
  const active = first(sp.active) ?? "";
  const page = toInt(sp.page, 1);
  return (
    <AdminPage title="Questions" crumbs={[{ label: "Questions" }]}>
      {async () => {
        const [subjects, list] = await Promise.all([
          listSubjects(),
          listQuestions({ subjectId: subjectId || undefined, search: q || undefined, active: active === "true" ? true : active === "false" ? false : undefined, page, perPage: PER_PAGE }),
        ]);
        const pages = Math.max(1, Math.ceil(list.total / PER_PAGE));
        const link = (p: number) => {
          const u = new URLSearchParams();
          if (subjectId) u.set("subject_id", subjectId);
          if (q) u.set("q", q);
          if (active) u.set("active", active);
          u.set("page", String(p));
          return `/admin/questions?${u}`;
        };
        return (
          <>
            <form className="toolbar" method="get">
              <div>
                <label className="form-label" htmlFor="f-subject">Subject</label>
                <select id="f-subject" name="subject_id" className="form-select" defaultValue={subjectId}>
                  <option value="">All subjects</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="f-q">Search text or id</label>
                <input id="f-q" name="q" className="form-control" defaultValue={q} placeholder="e.g. subnet or net-014" />
              </div>
              <div>
                <label className="form-label" htmlFor="f-active">Status</label>
                <select id="f-active" name="active" className="form-select" defaultValue={active}>
                  <option value="">Any</option><option value="true">Enabled</option><option value="false">Disabled</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit">Search</button>
              {(subjectId || q || active) && <Link className="btn btn-secondary" href="/admin/questions">Clear</Link>}
            </form>
            <p className="text-muted">{list.total} question{list.total === 1 ? "" : "s"}</p>
            <div className="table-responsive">
              <table className="generaltable">
                <thead><tr><th>Subject</th><th>Id</th><th>Question</th><th>Type</th><th>Options</th><th>Image</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {list.rows.length === 0 && <tr><td colSpan={8} className="text-muted">No questions match.</td></tr>}
                  {list.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.subject_code ?? r.subject_name}</td>
                      <td className="mono">{r.external_id}</td>
                      <td style={{ maxWidth: 420 }}>{r.text.length > 140 ? r.text.slice(0, 140) + "…" : r.text}</td>
                      <td>{r.type === "single_choice" ? "single" : "multiple"}</td>
                      <td>{r.option_count}</td>
                      <td>{r.has_image ? "Yes" : "-"}</td>
                      <td>{r.active ? "Enabled" : <span className="text-warning">Disabled</span>}</td>
                      <td className="text-nowrap">
                        <Link className="btn btn-sm btn-outline-secondary me-1" href={`/admin/questions/${r.id}`}>Edit</Link>
                        <DeleteQuestionButton id={r.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="pager">
                {page > 1 && <Link className="btn btn-secondary btn-sm" href={link(page - 1)}>Previous</Link>}
                <span>Page {page} of {pages}</span>
                {page < pages && <Link className="btn btn-secondary btn-sm" href={link(page + 1)}>Next</Link>}
              </div>
            )}
          </>
        );
      }}
    </AdminPage>
  );
}
