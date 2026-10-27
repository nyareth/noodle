"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, api } from "@/lib/api-client";
import type { QuestionDetail } from "@/lib/services/questions";
import DeleteQuestionButton from "./DeleteQuestionButton";

interface Opt { key: number; label: string; text: string; correct: boolean }

export default function QuestionEditor({ question }: { question: QuestionDetail }) {
  const router = useRouter();
  const [externalId, setExternalId] = useState(question.external_id);
  const [type, setType] = useState(question.type);
  const [text, setText] = useState(question.text);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [active, setActive] = useState(question.active);
  const [alt, setAlt] = useState(question.image_alt ?? "");
  const [options, setOptions] = useState<Opt[]>(question.options.map((o, i) => ({ key: i, label: o.label, text: o.text, correct: o.correct })));
  const [nextKey, setNextKey] = useState(question.options.length);
  const [image, setImage] = useState(question.image_src);
  const [errors, setErrors] = useState<string[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setOpt = (key: number, patch: Partial<Opt>) => setOptions((os) => os.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const move = (i: number, d: -1 | 1) => setOptions((os) => { const a = [...os]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const addOption = () => {
    const used = new Set(options.map((o) => o.label));
    let label = "";
    for (let c = 65; c < 91; c++) if (!used.has(String.fromCharCode(c))) { label = String.fromCharCode(c); break; }
    setOptions((os) => [...os, { key: nextKey, label, text: "", correct: false }]);
    setNextKey((k) => k + 1);
  };
  const toggleCorrect = (key: number, checked: boolean) =>
    setOptions((os) => os.map((o) => (type === "single_choice" ? { ...o, correct: o.key === key ? checked : false } : o.key === key ? { ...o, correct: checked } : o)));

  function explain(e: unknown): string[] {
    if (e instanceof ApiClientError) {
      const list = e.data?.errors as { message: string }[] | undefined;
      if (list?.length) return list.map((x) => x.message);
      return [e.message];
    }
    return ["Something went wrong."];
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors([]); setOk(null);
    try {
      await api(`/api/admin/questions/${question.id}`, {
        method: "PATCH",
        body: {
          external_id: externalId, type, text, explanation: explanation.trim() ? explanation : null, active,
          options: options.map((o) => ({ label: o.label, text: o.text })),
          correct_answers: options.filter((o) => o.correct).map((o) => o.label),
          image_alt: alt.trim() || null,
        },
      });
      setOk("Saved. Past attempts keep the wording they were given.");
      router.refresh();
    } catch (err) { setErrors(explain(err)); }
    finally { setBusy(false); }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErrors([]); setOk(null);
    const form = new FormData();
    form.set("file", file);
    if (alt.trim()) form.set("alt", alt.trim());
    try {
      const r = await api<{ question: QuestionDetail }>(`/api/admin/questions/${question.id}/image`, { form });
      setImage(r.question.image_src);
      setOk("Image saved.");
    } catch (err) { setErrors(explain(err)); }
  }
  async function removeImage() {
    if (!window.confirm("Remove the image from this question?")) return;
    try { await api(`/api/admin/questions/${question.id}/image`, { method: "DELETE" }); setImage(null); setOk("Image removed."); }
    catch (err) { setErrors(explain(err)); }
  }

  return (
    <form onSubmit={save}>
      <p className="text-muted">Subject: <b>{question.subject_name}</b></p>
      {errors.length > 0 && <div className="alert alert-danger" role="alert"><ul className="issue-list mb-0">{errors.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
      {ok && <div className="alert alert-success" role="status">{ok}</div>}

      <div className="d-flex flex-wrap gap-3 mb-3">
        <div style={{ flex: "1 1 200px" }}>
          <label className="form-label" htmlFor="q-id">Question id</label>
          <input id="q-id" className="form-control mono" value={externalId} onChange={(e) => setExternalId(e.target.value)} required />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="form-label" htmlFor="q-type">Type</label>
          <select id="q-type" className="form-select" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="single_choice">Single choice (one correct answer)</option>
            <option value="multiple_choice">Multiple choice (one or more correct answers)</option>
          </select>
        </div>
        <div className="form-check" style={{ alignSelf: "flex-end", marginBottom: ".5rem" }}>
          <input id="q-active" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <label htmlFor="q-active">Enabled (can appear in attempts)</label>
        </div>
      </div>

      <div className="mb-3">
        <label className="form-label" htmlFor="q-text">Question text</label>
        <textarea id="q-text" className="form-control" rows={6} value={text} onChange={(e) => setText(e.target.value)} required />
        <div className="form-text">Shown exactly as typed. Blank lines start a new paragraph; lines starting with &quot;- &quot; or &quot;1. &quot; become lists; $x^2$ is math.</div>
      </div>

      <div className="mb-3">
        <label className="form-label">Answer options</label>
        <div className="small text-muted mb-2">
          Tick <b>{type === "single_choice" ? "the one correct option" : "every correct option"}</b>. Order here is the order students see (unless the subject shuffles options).
        </div>
        {options.map((o, i) => (
          <div className="opt-row" key={o.key}>
            <input className="form-control" aria-label={`Label of option ${i + 1}`} value={o.label} onChange={(e) => setOpt(o.key, { label: e.target.value })} />
            <input className="form-control" aria-label={`Text of option ${i + 1}`} value={o.text} onChange={(e) => setOpt(o.key, { text: e.target.value })} />
            <label className="form-check" style={{ margin: 0 }}>
              <input type={type === "single_choice" ? "radio" : "checkbox"} name="correct" checked={o.correct} onChange={(e) => toggleCorrect(o.key, e.target.checked)} /> correct
            </label>
            <span className="text-nowrap">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>{" "}
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => move(i, 1)} disabled={i === options.length - 1} aria-label="Move down">↓</button>{" "}
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setOptions((os) => os.filter((x) => x.key !== o.key))} disabled={options.length <= 2} aria-label="Remove option">✕</button>
            </span>
          </div>
        ))}
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={addOption} disabled={options.length >= 26}>Add option</button>
      </div>

      <div className="mb-4">
        <label className="form-label" htmlFor="q-expl">Explanation (shown in review if the subject allows it)</label>
        <textarea id="q-expl" className="form-control" rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </div>

      <div className="card mb-4">
        <div className="card-body">
          <h5 className="card-title">Image</h5>
          {image ? (
            <div className="mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="qthumb" src={image} alt={alt || "Question image"} />
            </div>
          ) : <p className="text-muted">No image attached.</p>}
          <div className="d-flex flex-wrap gap-3 align-items-end">
            <div>
              <label className="form-label" htmlFor="q-img">{image ? "Replace image" : "Attach image"} (PNG, JPEG, GIF or WebP)</label>
              <input id="q-img" className="form-control" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={upload} />
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <label className="form-label" htmlFor="q-alt">Alt text (optional)</label>
              <input id="q-alt" className="form-control" value={alt} onChange={(e) => setAlt(e.target.value)} />
              <div className="form-text">Saved with the question; also sent with the next upload.</div>
            </div>
            {image && <button type="button" className="btn btn-outline-secondary" onClick={removeImage}>Remove image</button>}
          </div>
          {question.image_url && !question.image_key && <p className="small text-muted mt-2">This image is an external link: {question.image_url}</p>}
        </div>
      </div>

      <div className="d-flex gap-2">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button className="btn btn-secondary" type="button" onClick={() => router.push("/admin/questions")}>Back to questions</button>
        <span className="ms-auto"><DeleteQuestionButton id={question.id} redirectTo="/admin/questions" /></span>
      </div>
    </form>
  );
}
