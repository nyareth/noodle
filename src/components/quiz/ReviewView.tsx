import Link from "next/link";
import { fmt2, fmtPct, formatDateTime, formatDuration } from "@/lib/format";
import type { ReviewPayload } from "@/lib/services/attempts";
import { NavBlock, type NavButton } from "./NavBlock";
import { QuestionBlock } from "./QuestionBlock";

/**
 * Moodle's review page: summary table, questions with right/wrong feedback, and the navigation block
 * coloured by result. Server-rendered; paging uses plain links (?page=2, ?showall=1).
 */
export function ReviewView({ payload, page, showAll, basePath, finishHref, finishLabel }: {
  payload: ReviewPayload;
  page: number;
  showAll: boolean;
  basePath: string;
  finishHref: string;
  finishLabel: string;
}) {
  const a = payload.attempt;
  const per = a.questions_per_page;
  const all = payload.questions;
  const pageCount = Math.max(1, Math.ceil(all.length / per));
  const p = showAll ? 1 : Math.min(Math.max(1, page), pageCount);
  const start = showAll ? 0 : (p - 1) * per;
  const shown = showAll ? all : all.slice(start, start + per);
  const taken = a.finished_at ? (new Date(a.finished_at).getTime() - new Date(a.started_at).getTime()) / 1000 : 0;
  const correct = a.correct_count ?? 0;
  const pct = a.score_percent ?? 0;

  const hrefFor = (i: number) => (showAll ? `${basePath}?showall=1#question-${i + 1}` : `${basePath}?page=${Math.floor(i / per) + 1}#question-${i + 1}`);
  const buttons: NavButton[] = all.map((q, i) => ({
    number: i + 1,
    state: payload.shows.correctness ? (q.is_correct ? "correct" : "incorrect") : q.answered ? "answersaved" : "notyetanswered",
    thispage: !showAll && i >= start && i < start + per,
    flagged: q.flagged,
    href: hrefFor(i),
  }));

  return (
    <>
      <section id="region-main" aria-label="Content">
        <div role="main">
          <table className="generaltable generalbox quizreviewsummary">
            <tbody>
              {payload.student && (
                <tr><th className="cell" scope="row">Student</th><td className="cell">{payload.student.name} ({payload.student.email})</td></tr>
              )}
              {payload.student && (
                <tr><th className="cell" scope="row">Subject</th><td className="cell">{a.subject_name}{a.subject_code ? ` (${a.subject_code})` : ""}</td></tr>
              )}
              <tr><th className="cell" scope="row">Started on</th><td className="cell">{formatDateTime(a.started_at, a.timezone)}</td></tr>
              <tr><th className="cell" scope="row">State</th><td className="cell">Finished{a.finish_reason === "time_expired" ? " (the time limit expired and the attempt was submitted automatically)" : ""}</td></tr>
              {a.finished_at && <tr><th className="cell" scope="row">Completed on</th><td className="cell">{formatDateTime(a.finished_at, a.timezone)}</td></tr>}
              <tr><th className="cell" scope="row">Time taken</th><td className="cell">{formatDuration(taken)}</td></tr>
              <tr><th className="cell" scope="row">Marks</th><td className="cell">{fmt2(correct)}/{fmt2(a.total_questions)}</td></tr>
              <tr>
                <th className="cell" scope="row">Grade</th>
                <td className="cell"><b>{fmt2(pct)}</b> out of {fmt2(100)} (<b>{fmtPct(pct)}</b>%)</td>
              </tr>
            </tbody>
          </table>

          {!payload.review_available && (
            <div className="alert alert-info">
              The detailed review of questions is not available for this subject. Your result is shown above.
            </div>
          )}

          {shown.map((q, i) => (
            <QuestionBlock
              key={q.id}
              number={start + i + 1}
              type={q.type}
              html={q.html}
              image={q.image}
              options={q.options.map((o) => ({
                id: o.id,
                html: o.html,
                selected: o.selected,
                icon: o.selected && o.selected_correct !== undefined ? (o.selected_correct ? "correct" : "incorrect") : null,
              }))}
              numbering={a.answer_numbering}
              flagged={q.flagged}
              answered={q.answered}
              review={{
                verdict: q.is_correct ? "correct" : q.answered ? "incorrect" : "notanswered",
                rightAnswerHtml: q.right_answer_html,
                explanationHtml: q.explanation_html,
              }}
            />
          ))}

          <div className="submitbtns">
            {!showAll && p > 1 && (
              <Link className="mod_quiz-prev-nav btn btn-secondary" href={`${basePath}?page=${p - 1}`}>Previous page</Link>
            )}
            {!showAll && p < pageCount ? (
              <Link className="mod_quiz-next-nav btn btn-primary" href={`${basePath}?page=${p + 1}`}>Next page</Link>
            ) : (
              <Link className="mod_quiz-next-nav btn btn-primary" href={finishHref}>{finishLabel}</Link>
            )}
          </div>
        </div>
      </section>

      {payload.review_available && (
        <aside id="block-region-side-pre" className="drawer-right" aria-label="Blocks">
          <NavBlock
            buttons={buttons}
            allOnOnePage={showAll}
            links={[
              showAll
                ? { label: "Show one page at a time", href: basePath }
                : { label: "Show all questions on one page", href: `${basePath}?showall=1` },
              { label: finishLabel, href: finishHref },
            ]}
          />
        </aside>
      )}
    </>
  );
}
