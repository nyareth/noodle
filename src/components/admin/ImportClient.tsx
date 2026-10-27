"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ApiClientError, api } from "@/lib/api-client";
import type { ImportPreview } from "@/lib/services/importer";

const EXAMPLE = `{
  "subject": { "name": "Computer Networking", "code": "NET101" },
  "questions": [
    {
      "external_id": "net-001",
      "text": "Which characteristic allows a network to expand rapidly?",
      "type": "single_choice",
      "options": [
        { "label": "A", "text": "Scalability" },
        { "label": "B", "text": "Quality of service" }
      ],
      "correct_answers": ["A"],
      "explanation": null,
      "image": null
    }
  ]
}`;

interface CommitResult { subject_name: string; created: number; updated: number; skipped: number }

export default function ImportClient() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(25);
  const parsedRef = useRef<unknown>(null);

  function parse(): unknown | undefined {
    try { return JSON.parse(text); }
    catch (e) { setError(`This is not valid JSON: ${(e as Error).message}`); return undefined; }
  }

  async function runPreview() {
    setError(null); setResult(null); setPreview(null);
    const data = parse();
    if (data === undefined) return;
    parsedRef.current = data;
    setBusy(true);
    try {
      setPreview(await api<ImportPreview>("/api/admin/import", { body: { data, mode, commit: false } }));
      setShown(25);
    } catch (e) { setError(e instanceof Error ? e.message : "Preview failed."); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!preview?.ok) return;
    setBusy(true); setError(null);
    try {
      const r = await api<CommitResult>("/api/admin/import", { body: { data: parsedRef.current, mode, commit: true } });
      setResult(r); setPreview(null); setText("");
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "invalid_import") { setError("The file has validation errors. Preview it again to see them."); }
      else setError(e instanceof Error ? e.message : "Import failed.");
    } finally { setBusy(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { setText(await f.text()); setPreview(null); setResult(null); setError(null); }
    e.target.value = "";
  }

  const todo = preview ? preview.counts.create + preview.counts.update : 0;

  return (
    <>
      <p>
        Paste the JSON produced by your transcription tool (or choose the file). Nothing is saved until you press the import button
        after the preview. Wording, option order and answer keys are stored exactly as written in the file.
      </p>
      <details className="mb-3">
        <summary className="clickable">Expected format</summary>
        <pre className="mono mt-2 p-3" style={{ background: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: 8, overflowX: "auto" }}>{EXAMPLE}</pre>
        <p className="small text-muted">
          <code>type</code> is <code>single_choice</code> (exactly one correct answer) or <code>multiple_choice</code>. <code>correct_answers</code> lists option
          labels exactly as written in <code>options</code>. <code>external_id</code> must stay the same across imports - it is how duplicates are detected.
          <code>image</code> may be <code>null</code> (attach pictures later from <em>Questions</em>) or an https URL. Text may use blank lines for paragraphs,
          &quot;- &quot; or &quot;1. &quot; list lines, and $math$ in TeX.
        </p>
      </details>

      <div className="mb-3">
        <label className="form-label" htmlFor="json">Question bank JSON</label>
        <textarea id="json" className="form-control mono" rows={14} spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} placeholder='{ "subject": { ... }, "questions": [ ... ] }' />
      </div>
      <div className="toolbar">
        <div>
          <label className="form-label" htmlFor="file">…or choose a .json file</label>
          <input id="file" className="form-control" type="file" accept=".json,application/json" onChange={onFile} />
        </div>
        <div>
          <label className="form-label" htmlFor="mode">If a question id already exists</label>
          <select id="mode" className="form-select" value={mode} onChange={(e) => { setMode(e.target.value as "skip" | "update"); setPreview(null); }}>
            <option value="skip">Skip it (keep the current version)</option>
            <option value="update">Update it with the file&apos;s version</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={runPreview} disabled={busy || !text.trim()}>{busy && !preview ? "Checking…" : "Validate and preview"}</button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {result && (
        <div className="alert alert-success" role="status">
          Imported into <b>{result.subject_name}</b>: {result.created} added, {result.updated} updated, {result.skipped} skipped (already there).{" "}
          <Link href="/admin/questions">Browse the questions</Link> to attach images.
        </div>
      )}

      {preview && (
        <>
          <h3 className="h5 mt-4">Preview</h3>
          <div className={`alert ${preview.ok ? "alert-info" : "alert-danger"}`}>
            {preview.subject ? (
              <p>
                Subject: <b>{preview.subject.name}</b>{preview.subject.code ? ` (${preview.subject.code})` : ""} -{" "}
                {preview.subject.status === "new" ? "will be created" : <>already exists{preview.subject.existing_name && preview.subject.existing_name !== preview.subject.name ? ` as "${preview.subject.existing_name}"` : ""}</>}
              </p>
            ) : <p>The subject could not be read.</p>}
            <p className="mb-0">
              {preview.total_in_file} question(s) in the file: <b>{preview.counts.create}</b> new, <b>{preview.counts.update}</b> to update,{" "}
              <b>{preview.counts.skip}</b> already present (skipped). {preview.errors.length > 0 && <b>{preview.errors.length} error(s) must be fixed first.</b>}
            </p>
          </div>

          {preview.errors.length > 0 && (
            <div className="alert alert-danger">
              <b>Errors</b> (nothing can be imported until these are fixed)
              <ul className="issue-list mt-2">
                {preview.errors.map((e, i) => (
                  <li key={i}>
                    {e.question_index ? <b>Question #{e.question_index}{e.external_id ? ` (${e.external_id})` : ""}: </b> : null}
                    {e.message} <span className="text-muted mono">{e.path}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.warnings.length > 0 && (
            <div className="alert alert-warning">
              <b>Warnings</b> (you can still import)
              <ul className="issue-list mt-2">
                {preview.warnings.map((e, i) => (
                  <li key={i}>
                    {e.question_index ? <b>Question #{e.question_index}{e.external_id ? ` (${e.external_id})` : ""}: </b> : null}{e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.items.length > 0 && (
            <>
              <h4 className="h6">Questions as they will be stored (correct answers in bold with ✓)</h4>
              {preview.items.slice(0, shown).map((q) => (
                <div key={q.index} className={`preview-q${q.action === "skip" ? " skip" : ""}`}>
                  <div className="d-flex flex-wrap gap-2 align-items-center mb-1">
                    <b>#{q.index}</b> <span className="mono">{q.external_id}</span>
                    <span className="badge badge-secondary">{q.type === "single_choice" ? "single choice" : "multiple choice"}</span>
                    <span className={`badge ${q.action === "create" ? "badge-success" : q.action === "update" ? "badge-info" : "badge-secondary"}`}>
                      {q.action === "create" ? "new" : q.action === "update" ? "will update" : "skipped - already exists"}
                    </span>
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }} className="mb-2">{q.text}</div>
                  {q.options.map((o) => (
                    <div key={o.label} className={`opt${o.correct ? " correct" : ""}`}>
                      <span className="lbl">{o.label}</span><span style={{ whiteSpace: "pre-wrap" }}>{o.text}</span>{o.correct && <span> ✓</span>}
                    </div>
                  ))}
                  {q.explanation && <div className="small text-muted mt-2" style={{ whiteSpace: "pre-wrap" }}>Explanation: {q.explanation}</div>}
                </div>
              ))}
              {shown < preview.items.length && (
                <button className="btn btn-outline-secondary mb-3" onClick={() => setShown((s) => s + 50)}>Show more ({preview.items.length - shown} left)</button>
              )}
            </>
          )}

          <div className="d-flex gap-2 mt-3">
            <button className="btn btn-primary" disabled={!preview.ok || busy || todo === 0} onClick={commit}>
              {busy ? "Importing…" : !preview.ok ? "Fix the errors to import" : todo === 0 ? "Nothing new to import" : `Import ${todo} question${todo === 1 ? "" : "s"}`}
            </button>
            <button className="btn btn-secondary" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </>
      )}
    </>
  );
}
