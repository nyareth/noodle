import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import { env } from "@/lib/env";
import { fmt2, formatDateTime } from "@/lib/format";
import { first, toInt } from "@/lib/page-utils";
import { listAttemptsAdmin } from "@/lib/services/attempts";
import { listSubjects } from "@/lib/services/subjects";

const PER_PAGE = 25;

export default async function AdminAttemptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const subjectId = first(sp.subject_id) ?? "";
  const status = first(sp.status) ?? "";
  const userId = first(sp.user_id) ?? "";
  const page = toInt(sp.page, 1);
  return (
    <AdminPage title="Attempts" crumbs={[{ label: "Attempts" }]}>
      {async () => {
        const [subjects, list] = await Promise.all([
          listSubjects(),
          listAttemptsAdmin({ subjectId: subjectId || undefined, userId: userId || undefined, status: status || undefined, page, perPage: PER_PAGE }),
        ]);
        const pages = Math.max(1, Math.ceil(list.total / PER_PAGE));
        const link = (p: number) => {
          const u = new URLSearchParams();
          if (subjectId) u.set("subject_id", subjectId);
          if (status) u.set("status", status);
          if (userId) u.set("user_id", userId);
          u.set("page", String(p));
          return `/admin/attempts?${u}`;
        };
        return (
          <>
            <form className="toolbar" method="get">
              {userId && <input type="hidden" name="user_id" value={userId} />}
              <div>
                <label className="form-label" htmlFor="a-subject">Subject</label>
                <select id="a-subject" name="subject_id" className="form-select" defaultValue={subjectId}>
                  <option value="">All subjects</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="a-status">State</label>
                <select id="a-status" name="status" className="form-select" defaultValue={status}>
                  <option value="">Any</option><option value="finished">Finished</option><option value="in_progress">In progress</option>
                </select>
              </div>
              <button className="btn btn-primary" type="submit">Filter</button>
              {(subjectId || status || userId) && <Link className="btn btn-secondary" href="/admin/attempts">Clear</Link>}
            </form>
            <p className="text-muted">{list.total} attempt{list.total === 1 ? "" : "s"}</p>
            <div className="table-responsive">
              <table className="generaltable">
                <thead><tr><th>Student</th><th>Subject</th><th>Started</th><th>State</th><th>Questions</th><th>Marks</th><th>Grade</th><th /></tr></thead>
                <tbody>
                  {list.rows.length === 0 && <tr><td colSpan={8} className="text-muted">No attempts yet.</td></tr>}
                  {list.rows.map((a) => (
                    <tr key={a.id}>
                      <td><Link href={`/admin/attempts?user_id=${a.user_id}`}>{a.user_name}</Link><span className="statedetails">{a.user_email}</span></td>
                      <td>{a.subject_name}</td>
                      <td>{formatDateTime(a.started_at, env.timezone)}</td>
                      <td>{a.status === "finished" ? "Finished" : "In progress"}</td>
                      <td>{a.total_questions}</td>
                      <td>{a.status === "finished" ? `${a.correct_count} / ${a.total_questions}` : "-"}</td>
                      <td>{a.status === "finished" ? fmt2(a.score_percent ?? 0) : "-"}</td>
                      <td>{a.status === "finished" && <Link href={`/admin/attempts/${a.id}`}>Review</Link>}</td>
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
