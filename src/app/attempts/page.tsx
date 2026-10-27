import type { Metadata } from "next";
import Link from "next/link";
import { MoodleShell } from "@/components/MoodleShell";
import { Alert } from "@/components/ui";
import { requirePageUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { fmt2, formatDateTime } from "@/lib/format";
import { listAttemptsForUser } from "@/lib/services/attempts";

export const metadata: Metadata = { title: "My attempts" };

export default async function MyAttemptsPage() {
  const user = await requirePageUser("/attempts");
  const attempts = await listAttemptsForUser(user.id);
  const tz = env.timezone;
  return (
    <MoodleShell user={user} title="My attempts" crumbs={[{ label: "My attempts" }]}>
      {attempts.length === 0 ? (
        <Alert kind="info">You have not attempted any quiz yet. <Link href="/">Choose a subject</Link> to start.</Alert>
      ) : (
        <div className="table-responsive">
          <table className="generaltable">
            <thead>
              <tr>
                <th className="cell">Subject</th>
                <th className="cell">Started</th>
                <th className="cell">State</th>
                <th className="cell">Questions</th>
                <th className="cell">Marks</th>
                <th className="cell">Grade / {fmt2(100)}</th>
                <th className="cell">Review</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td className="cell">{a.subject_id ? <Link href={`/subjects/${a.subject_id}`}>{a.subject_name}</Link> : a.subject_name}</td>
                  <td className="cell">{formatDateTime(a.started_at, tz)}</td>
                  <td className="cell">
                    {a.status === "finished" ? "Finished" : "In progress"}
                    {a.finish_reason === "time_expired" && <span className="statedetails">Time limit expired</span>}
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
      )}
    </MoodleShell>
  );
}
