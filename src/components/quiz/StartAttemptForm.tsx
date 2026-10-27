"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, api } from "@/lib/api-client";
import { formatDuration } from "@/lib/format";

/** "Attempt quiz" - the student chooses how many questions; the server picks them at random. */
export default function StartAttemptForm({ subjectId, available, defaultCount, secondsPerQuestion, label }: {
  subjectId: string;
  available: number;
  defaultCount: number;
  secondsPerQuestion: number | null;
  label: string;
}) {
  const router = useRouter();
  const [count, setCount] = useState(String(Math.min(defaultCount, available)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1;

  async function start(num: number) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ url: string }>("/api/attempts", { body: { subject_id: subjectId, question_count: num } });
      router.push(r.url);
    } catch (e) {
      setBusy(false);
      setConfirm(false);
      if (e instanceof ApiClientError && e.code === "not_enough_questions") setOffer(Number(e.data?.available) || available);
      else setError(e instanceof Error ? e.message : "Could not start the attempt.");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!valid) { setError("Enter a whole number of questions, 1 or more."); return; }
    if (n > available) { setOffer(available); return; }
    setOffer(null);
    if (secondsPerQuestion) setConfirm(true);
    else void start(n);
  }

  return (
    <div>
      <form className="quizstartform" onSubmit={onSubmit}>
        <label htmlFor="question_count" className="mb-0">Number of questions</label>
        <input id="question_count" className="form-control" type="number" inputMode="numeric" min={1} value={count} onChange={(e) => { setCount(e.target.value); setOffer(null); }} disabled={busy} />
        <span className="text-muted">of {available} available</span>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Starting…" : label}</button>
      </form>
      {error && <div className="alert alert-danger mt-3" role="alert">{error}</div>}
      {offer !== null && (
        <div className="alert alert-warning mt-3" role="alert">
          Only {offer} question{offer === 1 ? " is" : "s are"} available for this subject.
          <div className="mt-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { setCount(String(offer)); void start(offer); }}>
              Start with {offer} question{offer === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
      {confirm && secondsPerQuestion && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="start-title" style={{ textAlign: "left" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="start-title">Start attempt</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setConfirm(false)}>×</button>
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  Your attempt will have a time limit of {formatDuration(n * secondsPerQuestion)}. When you start, the timer will begin to
                  count down and cannot be paused. You must finish your attempt before it expires. Are you sure you wish to start now?
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" autoFocus disabled={busy} onClick={() => void start(n)}>Start attempt</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
