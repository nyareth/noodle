import Link from "next/link";
import { notFound } from "next/navigation";
import { MoodleShell } from "@/components/MoodleShell";
import StartAttemptForm from "@/components/quiz/StartAttemptForm";
import { Alert } from "@/components/ui";
import { requirePageUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { fmt2, formatDateTime, formatDuration } from "@/lib/format";
import { listAttemptsForUser } from "@/lib/services/attempts";
import { getSubject } from "@/lib/services/subjects";

export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/subjects/${id}`);
  const subject = await getSubject(id);
  if (!subject || (subject.available_questions === 0 && user.role !== "admin")) notFound();
  const attempts = await listAttemptsForUser(user.id, subject.id);
  const finished = attempts.filter((a) => a.status === "finished");
  const open = attempts.filter((a) => a.status === "in_progress");
  const best = finished.reduce<number | null>((m, a) => (m === null || (a.score_percent ?? 0) > m ? (a.score_percent ?? 0) : m), null);
  const tz = env.timezone;

  return (
    <MoodleShell user={user} title={subject.name} crumbs={[{ label: subject.name }]}>
      <div className="quizinfo">
        {subject.description && <p>{subject.description}</p>}
        <p>Questions available: <b>{subject.available_questions}</b></p>
        <p>Attempts allowed: Unlimited</p>
        <p>
          Time limit: {subject.time_per_question_seconds ? `${formatDuration(subject.time_per_question_seconds)} per question` : "None"}
        </p>
        <p>Grading method: Each attempt is graded separately (highest grade shown below)</p>
      </div>

      {open.length > 0 && (
        <Alert kind="info">
          You have an attempt in progress (started {formatDateTime(open[0].started_at, tz)}).{" "}
          <Link href={`/attempts/${open[0].id}`}><b>Continue the last attempt</b></Link>
        </Alert>
      )}

      {attempts.length > 0 && (
        <>
          <h3 className="h5">Summary of your previous attempts</h3>
          <div className="table-responsive">
            <table className="generaltable quizattemptsummary">
              <thead>
                <tr>
                  <th className="cell">Attempt</th>
                  <th className="cell">State</th>
                  <th className="cell">Questions</th>
                  <th className="cell">Marks</th>
                  <th className="cell">Grade / {fmt2(100)}</th>
                  <th className="cell">Review</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a, i) => (
                  <tr key={a.id}>
                    <td className="cell">{attempts.length - i}</td>
                    <td className="cell">
                      {a.status === "finished" ? "Finished" : "In progress"}
                      <span className="statedetails">
                        {a.status === "finished" && a.finished_at ? `Submitted ${formatDateTime(a.finished_at, tz)}` : `Started ${formatDateTime(a.started_at, tz)}`}
                      </span>
                    </td>
                    <td className="cell">{a.total_questions}</td>
                    <td className="cell">{a.status === "finished" ? `${fmt2(a.correct_count ?? 0)} / ${fmt2(a.total_questions)}` : "-"}</td>
                    <td className="cell">{a.status === "finished" ? fmt2(a.score_percent ?? 0) : "-"}</td>
                    <td className="cell">
                      {a.status === "finished" ? <Link href={`/attempts/${a.id}/review`}>Review</Link> : <Link href={`/attempts/${a.id}`}>Continue</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {best !== null && <p className="text-center">Your highest grade is <b>{fmt2(best)}</b> / {fmt2(100)}.</p>}
        </>
      )}

      <div className="quizstartbuttondiv">
        {subject.available_questions > 0 ? (
          <StartAttemptForm
            subjectId={subject.id}
            available={subject.available_questions}
            defaultCount={Math.min(subject.available_questions, finished[0]?.total_questions ?? 10)}
            secondsPerQuestion={subject.time_per_question_seconds}
            label={attempts.length ? "Re-attempt quiz" : "Attempt quiz"}
          />
        ) : (
          <Alert kind="warning">This subject has no questions yet.</Alert>
        )}
      </div>
    </MoodleShell>
  );
}
