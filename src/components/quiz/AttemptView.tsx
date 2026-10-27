"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, api } from "@/lib/api-client";
import { formatClock, formatDateTime } from "@/lib/format";
import type { TakingPayload, TakingQuestion } from "@/lib/services/attempts";
import { FlagIcon } from "../Icons";
import { NavBlock, type NavButton } from "./NavBlock";
import { QuestionBlock } from "./QuestionBlock";

type View = "attempt" | "summary";

/** The Moodle quiz attempt page: question pages, navigation block, timer, summary and submit confirmation. */
export default function AttemptView({ initial, initialPage, initialView }: { initial: TakingPayload; initialPage: number; initialView: View }) {
  const router = useRouter();
  const att = initial.attempt;
  const attemptId = att.id;
  const perPage = att.questions_per_page;

  const [questions, setQuestions] = useState<TakingQuestion[]>(initial.questions);
  const qRef = useRef(questions);
  const pageCount = Math.max(1, Math.ceil(questions.length / perPage));
  const [page, setPage] = useState(Math.min(Math.max(1, initialPage), pageCount));
  const [view, setView] = useState<View>(initialView);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  const submittingRef = useRef(false);
  const pending = useRef(new Map<string, Promise<void>>());
  const failed = useRef(new Set<string>());

  const patch = useCallback((qid: string, change: Partial<TakingQuestion>) => {
    const next = qRef.current.map((q) => (q.id === qid ? { ...q, ...change } : q));
    qRef.current = next;
    setQuestions(next);
  }, []);

  const refreshSaveState = useCallback(() => {
    setSaveState(pending.current.size ? "saving" : failed.current.size ? "error" : "idle");
  }, []);

  /** Returns true when the error ends the attempt (time up / already submitted / signed out). */
  const fatal = useCallback((e: unknown): boolean => {
    if (e instanceof ApiClientError) {
      if (e.code === "time_expired" || e.code === "attempt_finished") { router.replace(`/attempts/${attemptId}/review`); return true; }
      if (e.status === 401) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`; return true; }
    }
    return false;
  }, [router, attemptId]);

  /** Saves the latest selection of one question. Requests for the same question run one after another. */
  const saveAnswer = useCallback((qid: string) => {
    const job = async () => {
      const q = qRef.current.find((x) => x.id === qid);
      if (!q) return;
      try {
        await api(`/api/attempts/${attemptId}/questions/${qid}/answer`, { method: "PUT", body: { selected: q.selected } });
        failed.current.delete(qid);
      } catch (e) {
        if (!fatal(e)) failed.current.add(qid);
      }
    };
    const next: Promise<void> = (pending.current.get(qid) ?? Promise.resolve()).then(job);
    pending.current.set(qid, next);
    void next.finally(() => {
      if (pending.current.get(qid) === next) pending.current.delete(qid);
      refreshSaveState();
    });
    refreshSaveState();
  }, [attemptId, fatal, refreshSaveState]);

  const select = (q: TakingQuestion, optionId: string, checked: boolean) => {
    const selected = q.type === "single_choice" ? [optionId] : checked ? [...q.selected, optionId] : q.selected.filter((id) => id !== optionId);
    patch(q.id, { selected });
    saveAnswer(q.id);
  };
  const clearChoice = (q: TakingQuestion) => { patch(q.id, { selected: [] }); saveAnswer(q.id); };
  const toggleFlag = (q: TakingQuestion) => {
    const flagged = !q.flagged;
    patch(q.id, { flagged });
    api(`/api/attempts/${attemptId}/questions/${q.id}/flag`, { method: "PUT", body: { flagged } }).catch((e) => { fatal(e); });
  };

  /** Final submit: sends every answer and flag, so nothing is lost if an earlier autosave failed. */
  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setNotice(null);
    try {
      await Promise.race([Promise.allSettled([...pending.current.values()]), new Promise((r) => setTimeout(r, 4000))]);
      const answers: Record<string, string[]> = {};
      const flags: Record<string, boolean> = {};
      for (const q of qRef.current) { answers[q.id] = q.selected; flags[q.id] = q.flagged; }
      await api(`/api/attempts/${attemptId}/submit`, { method: "POST", body: { answers, flags } });
      router.replace(`/attempts/${attemptId}/review`);
    } catch (e) {
      submittingRef.current = false;
      setSubmitting(false);
      if (!fatal(e)) setNotice(e instanceof ApiClientError ? e.message : "The attempt could not be submitted. Please try again.");
    }
  }, [attemptId, fatal, router]);

  /* ---- timer (the server enforces the real deadline; this is only the countdown) ---- */
  const [left, setLeft] = useState<number | null>(att.seconds_left);
  const endAt = useRef<number | null>(att.seconds_left === null ? null : Date.now() + att.seconds_left * 1000);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (endAt.current === null) return;
    const t = setInterval(() => {
      const l = Math.max(0, Math.round((endAt.current! - Date.now()) / 1000));
      setLeft(l);
      if (l <= 0) { clearInterval(t); void submitRef.current(); }
    }, 500);
    return () => clearInterval(t);
  }, []);

  /* ---- retry failed saves when the connection comes back; warn before leaving with unsaved changes ---- */
  useEffect(() => {
    const retry = () => failed.current.forEach((qid) => saveAnswer(qid));
    const timer = setInterval(() => { if (failed.current.size && !pending.current.size) retry(); }, 15000);
    const beforeUnload = (e: BeforeUnloadEvent) => { if (failed.current.size) e.preventDefault(); };
    window.addEventListener("online", retry);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { clearInterval(timer); window.removeEventListener("online", retry); window.removeEventListener("beforeunload", beforeUnload); };
  }, [saveAnswer]);

  /* ---- keep the URL in step with the page so a refresh returns to the same place ---- */
  useEffect(() => {
    const qs = new URLSearchParams();
    if (view === "summary") qs.set("view", "summary");
    else if (page > 1) qs.set("page", String(page));
    const q = qs.toString();
    window.history.replaceState(null, "", q ? `?${q}` : window.location.pathname);
  }, [page, view]);

  useEffect(() => {
    if (scrollTo === null) return;
    document.getElementById(`question-${scrollTo}`)?.scrollIntoView({ block: "start" });
    setScrollTo(null);
  }, [scrollTo, page, view]);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !submittingRef.current) setConfirmOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  /* ---- navigation ---- */
  const goPage = (p: number) => { setView("attempt"); setPage(Math.min(Math.max(1, p), pageCount)); window.scrollTo({ top: 0 }); };
  const goToQuestion = (index: number) => {
    setView("attempt");
    setPage(Math.floor(index / perPage) + 1);
    setScrollTo(index + 1);
  };
  const showSummary = () => { setView("summary"); window.scrollTo({ top: 0 }); };

  const start = (page - 1) * perPage;
  const shown = questions.slice(start, start + perPage);
  const unanswered = questions.filter((q) => q.selected.length === 0).length;
  const lowTime = left !== null && left <= 100;

  const buttons: NavButton[] = useMemo(
    () => questions.map((q, i) => ({
      number: i + 1,
      state: q.selected.length ? "answersaved" : "notyetanswered",
      thispage: view === "attempt" && i >= start && i < start + perPage,
      flagged: q.flagged,
      href: `?page=${Math.floor(i / perPage) + 1}#question-${i + 1}`,
      onClick: (e) => { e.preventDefault(); goToQuestion(i); },
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, view, start, perPage, pageCount],
  );

  return (
    <>
      <section id="region-main" aria-label="Content">
        {left !== null && (
          <div id="quiz-timer-wrapper">
            <div id="quiz-timer" role="timer" aria-atomic="true" className={lowTime ? "timeleft-low" : ""}>
              <span id="quiz-timer-header">Time left</span> <span id="quiz-time-left">{formatClock(left)}</span>
            </div>
          </div>
        )}
        {notice && <div className="alert alert-danger" role="alert">{notice}</div>}
        {saveState === "error" && (
          <div className="alert alert-warning" role="alert">
            Connection problem: your latest changes have not been saved yet. They will be sent again automatically, and
            everything is sent when you submit.
          </div>
        )}
        <div role="main">
          {view === "attempt" ? (
            <form onSubmit={(e) => e.preventDefault()} autoComplete="off">
              {shown.map((q, i) => (
                <QuestionBlock
                  key={q.id}
                  number={start + i + 1}
                  type={q.type}
                  html={q.html}
                  image={q.image}
                  options={q.options.map((o) => ({ id: o.id, html: o.html, selected: q.selected.includes(o.id) }))}
                  numbering={att.answer_numbering}
                  flagged={q.flagged}
                  answered={q.selected.length > 0}
                  onSelect={(optionId, checked) => select(q, optionId, checked)}
                  onClear={() => clearChoice(q)}
                  onToggleFlag={() => toggleFlag(q)}
                />
              ))}
              <div className="submitbtns">
                {page > 1 && (
                  <button type="button" className="mod_quiz-prev-nav btn btn-secondary" onClick={() => goPage(page - 1)}>Previous page</button>
                )}
                {page < pageCount ? (
                  <button type="button" className="mod_quiz-next-nav btn btn-primary" onClick={() => goPage(page + 1)}>Next page</button>
                ) : (
                  <button type="button" className="mod_quiz-next-nav btn btn-primary" onClick={showSummary}>Finish attempt ...</button>
                )}
              </div>
            </form>
          ) : (
            <div className="quizsummary">
              <h3>Summary of attempt</h3>
              <table className="generaltable quizsummaryofattempt">
                <thead>
                  <tr><th scope="col" className="cell">Question</th><th scope="col" className="cell">Status</th></tr>
                </thead>
                <tbody>
                  {questions.map((q, i) => (
                    <tr key={q.id}>
                      <td className="cell">
                        <a href={`?page=${Math.floor(i / perPage) + 1}#question-${i + 1}`} onClick={(e) => { e.preventDefault(); goToQuestion(i); }} title={`Go to question ${i + 1}`}>
                          {i + 1}
                        </a>
                        {q.flagged && <span className="text-danger ms-1"><FlagIcon on /> <span className="accesshide">Flagged</span></span>}
                      </td>
                      <td className="cell">{q.selected.length ? "Answer saved" : "Not yet answered"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {att.deadline_at && (
                <p>This attempt must be submitted by {formatDateTime(att.deadline_at, att.timezone)}.</p>
              )}
              <div className="submitbtns">
                <button type="button" className="btn btn-secondary" onClick={() => goPage(page)}>Return to attempt</button>
                <button type="button" className="btn btn-primary" onClick={() => setConfirmOpen(true)}>Submit all and finish</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside id="block-region-side-pre" className="drawer-right" aria-label="Blocks">
        <NavBlock
          buttons={buttons}
          links={[{ label: "Finish attempt ...", href: "?view=summary", onClick: (e) => { e.preventDefault(); showSummary(); } }]}
        >
          <div className="autosave_info" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved yet - retrying" : ""}
          </div>
        </NavBlock>
      </aside>

      {confirmOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => { if (e.target === e.currentTarget && !submitting) setConfirmOpen(false); }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="confirm-title">Submit all your answers and finish?</h5>
                <button type="button" className="btn-close" aria-label="Close" disabled={submitting} onClick={() => setConfirmOpen(false)}>×</button>
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  {unanswered > 0 && <>You have {unanswered} unanswered question{unanswered === 1 ? "" : "s"}. </>}
                  Once you submit, you will no longer be able to change your answers for this attempt.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" disabled={submitting} onClick={() => setConfirmOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" autoFocus disabled={submitting} onClick={() => void submit()}>
                  {submitting ? "Submitting…" : "Submit all and finish"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
