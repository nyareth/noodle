import Link from "next/link";
import { MoodleShell } from "@/components/MoodleShell";
import { Alert } from "@/components/ui";
import { requirePageUser } from "@/lib/auth";
import { formatDateTime, formatDuration } from "@/lib/format";
import { env } from "@/lib/env";
import { bannerStyle } from "@/lib/page-utils";
import { listAttemptsForUser } from "@/lib/services/attempts";
import { listSubjectsForStudent } from "@/lib/services/subjects";

export default async function HomePage() {
  const user = await requirePageUser("/");
  const [subjects, attempts] = await Promise.all([listSubjectsForStudent(user.id), listAttemptsForUser(user.id)]);
  const open = attempts.filter((a) => a.status === "in_progress");

  return (
    <MoodleShell user={user} title="Available quizzes">
      {open.length > 0 && (
        <Alert kind="info">
          <b>You have {open.length === 1 ? "an attempt" : `${open.length} attempts`} in progress.</b>
          <ul className="mb-0 mt-2">
            {open.map((a) => (
              <li key={a.id}>
                <Link href={`/attempts/${a.id}`}>{a.subject_name}</Link> - {a.total_questions} questions, started {formatDateTime(a.started_at, env.timezone)}
                {a.deadline_at && <> (must be submitted by {formatDateTime(a.deadline_at, env.timezone)})</>}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <h3 className="h5 mb-3">Subjects</h3>
      {subjects.length === 0 ? (
        <Alert kind="info">No subjects have questions yet. Please check back later.</Alert>
      ) : (
        <div className="card-grid">
          {subjects.map((s) => (
            <div key={s.id} className="card coursecard">
              <div className="banner" style={bannerStyle(s.name)} />
              <div className="card-body">
                {s.code && <div className="text-muted small mb-1">{s.code}</div>}
                <h5 className="card-title"><Link href={`/subjects/${s.id}`}>{s.name}</Link></h5>
                {s.description && <p className="text-muted small">{s.description}</p>}
                <div className="small">
                  {s.available_questions} question{s.available_questions === 1 ? "" : "s"} available
                  {s.time_per_question_seconds ? <> · {formatDuration(s.time_per_question_seconds * s.available_questions)}</> : null}
                </div>
              </div>
              <div className="card-footer d-flex align-items-center justify-content-between gap-2">
                <span className="small text-muted">
                  {s.my_attempts > 0 ? <>Attempts: {s.my_attempts} · Best: {Number(s.my_best_percent ?? 0).toFixed(0)}%</> : "No attempts yet"}
                </span>
                <Link className="btn btn-primary btn-sm" href={`/subjects/${s.id}`}>Open</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </MoodleShell>
  );
}
