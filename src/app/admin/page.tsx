import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import { env } from "@/lib/env";
import { fmt2, formatDateTime } from "@/lib/format";
import { listAttemptsAdmin } from "@/lib/services/attempts";
import { getAdminStats } from "@/lib/services/stats";

export default async function AdminHome() {
  return (
    <AdminPage title="Administration">
      {async () => {
        const [stats, recent] = await Promise.all([getAdminStats(), listAttemptsAdmin({ page: 1, perPage: 8 })]);
        return (
          <>
            <div className="stat-grid">
              <div className="stat"><span className="num">{stats.students}</span><span className="label">Active students</span></div>
              <div className="stat"><span className="num">{stats.subjects}</span><span className="label">Subjects</span></div>
              <div className="stat"><span className="num">{stats.questions}</span><span className="label">Questions in the bank</span></div>
              <div className="stat"><span className="num">{stats.finished}</span><span className="label">Finished attempts ({stats.attempts} started)</span></div>
              <div className="stat"><span className="num">{stats.avg_score === null ? "-" : `${Number(stats.avg_score).toFixed(0)}%`}</span><span className="label">Average score</span></div>
            </div>
            <div className="d-flex flex-wrap gap-2 mb-4">
              <Link className="btn btn-primary" href="/admin/import">Import questions (JSON)</Link>
              <Link className="btn btn-secondary" href="/admin/subjects">Manage subjects</Link>
              <Link className="btn btn-secondary" href="/admin/questions">Browse questions</Link>
              <Link className="btn btn-secondary" href="/admin/users">Manage users</Link>
            </div>
            <h3 className="h5">Latest attempts</h3>
            {recent.rows.length === 0 ? <p className="text-muted">No attempts yet.</p> : (
              <div className="table-responsive">
                <table className="generaltable">
                  <thead><tr><th>Student</th><th>Subject</th><th>Started</th><th>State</th><th>Grade</th><th /></tr></thead>
                  <tbody>
                    {recent.rows.map((a) => (
                      <tr key={a.id}>
                        <td>{a.user_name}</td>
                        <td>{a.subject_name}</td>
                        <td>{formatDateTime(a.started_at, env.timezone)}</td>
                        <td>{a.status === "finished" ? "Finished" : "In progress"}</td>
                        <td>{a.status === "finished" ? `${fmt2(a.score_percent ?? 0)} (${a.correct_count}/${a.total_questions})` : "-"}</td>
                        <td>{a.status === "finished" && <Link href={`/admin/attempts/${a.id}`}>View</Link>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );
      }}
    </AdminPage>
  );
}
