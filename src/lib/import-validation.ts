import type { QuestionType } from "./grading";
import { normalizeForCompare } from "./util";

/**
 * Pure validation of the question-bank JSON. It never "fixes" anything: wording, option order and
 * answer keys are taken exactly as supplied, and anything ambiguous becomes an error for the admin.
 */
export const MAX_IMPORT_QUESTIONS = 5000;

export interface ImportIssue {
  path: string;
  message: string;
  question_index?: number; // 1-based position in the file
  external_id?: string;
}
export interface ParsedQuestion {
  index: number;
  external_id: string;
  type: QuestionType;
  text: string;
  options: { label: string; text: string }[];
  correct_labels: string[];
  explanation: string | null;
  image_url: string | null;
  image_alt: string | null;
}
export interface ParsedImport {
  subject: { name: string; code: string | null } | null;
  total_in_file: number;
  questions: ParsedQuestion[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
}
interface Sink { errors: ImportIssue[]; warnings: ImportIssue[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const show = (v: unknown) => (JSON.stringify(v) ?? String(v)).slice(0, 40);
const QUESTION_KEYS = new Set(["external_id", "text", "type", "options", "correct_answers", "explanation", "image", "image_alt"]);

export function validateQuestionObject(q: unknown, index: number, sink: Sink): ParsedQuestion | null {
  const base = `questions[${index - 1}]`;
  let externalId: string | undefined;
  const before = sink.errors.length;
  const err = (path: string, message: string) => sink.errors.push({ path: base + path, message, question_index: index, external_id: externalId });
  const warn = (path: string, message: string) => sink.warnings.push({ path: base + path, message, question_index: index, external_id: externalId });

  if (!isObj(q)) { err("", "Each question must be a JSON object."); return null; }

  if (typeof q.external_id === "string" && q.external_id.trim()) externalId = q.external_id;
  else err(".external_id", '"external_id" is required: a stable, unique text id such as "net-001" (it is used to stop duplicate imports).');

  if (typeof q.text !== "string" || !q.text.trim()) err(".text", '"text" must be a non-empty string.');

  const type = q.type;
  if (type !== "single_choice" && type !== "multiple_choice") {
    err(".type", `"type" must be "single_choice" or "multiple_choice" (got ${show(type)}).`);
  }

  // options
  const options: { label: string; text: string }[] = [];
  let optionsOk = true;
  if (!Array.isArray(q.options) || q.options.length < 2) {
    err(".options", '"options" must be an array with at least 2 options.');
    optionsOk = false;
  } else if (q.options.length > 26) {
    err(".options", "A question can have at most 26 options.");
    optionsOk = false;
  } else {
    const labels = new Set<string>();
    const texts = new Set<string>();
    q.options.forEach((o, i) => {
      if (!isObj(o)) { err(`.options[${i}]`, `Option ${i + 1} must be an object like {"label": "A", "text": "..."}.`); optionsOk = false; return; }
      const labelOk = typeof o.label === "string" && o.label.trim() !== "";
      const textOk = typeof o.text === "string" && o.text.trim() !== "";
      if (!labelOk) { err(`.options[${i}].label`, `Option ${i + 1} needs a non-empty "label" (for example "A").`); optionsOk = false; }
      if (!textOk) { err(`.options[${i}].text`, `Option ${i + 1}${labelOk ? ` ("${o.label}")` : ""} needs a non-empty "text".`); optionsOk = false; }
      if (!labelOk || !textOk) return;
      const label = o.label as string, text = o.text as string;
      if (labels.has(label)) { err(`.options[${i}].label`, `Option label "${label}" is used more than once.`); optionsOk = false; }
      labels.add(label);
      const key = normalizeForCompare(text);
      if (texts.has(key)) warn(`.options[${i}].text`, `Option "${label}" has the same text as another option.`);
      texts.add(key);
      options.push({ label, text });
    });
  }

  // answer key
  const correct: string[] = [];
  if (!Array.isArray(q.correct_answers) || q.correct_answers.length === 0) {
    err(".correct_answers", '"correct_answers" must be a non-empty array of option labels, for example ["A"].');
  } else {
    const labels = options.map((o) => o.label);
    q.correct_answers.forEach((c, i) => {
      if (typeof c !== "string") { err(`.correct_answers[${i}]`, `Correct answers must be option labels written as strings (got ${show(c)}).`); return; }
      if (correct.includes(c)) { err(`.correct_answers[${i}]`, `Correct answer "${c}" is listed more than once.`); return; }
      if (optionsOk && !labels.includes(c)) {
        err(`.correct_answers[${i}]`, `Correct answer "${c}" does not match any option label (labels: ${labels.join(", ")}). Labels must match exactly, including capitalisation.`);
        return;
      }
      correct.push(c);
    });
    if (type === "single_choice" && q.correct_answers.length !== 1) {
      err(".correct_answers", `A single_choice question needs exactly one correct answer, but ${q.correct_answers.length} were given. Change "type" to "multiple_choice" or fix the answer key.`);
    }
    if (type === "multiple_choice" && optionsOk && correct.length === 1) warn(".correct_answers", "This multiple_choice question has only one correct answer. Is single_choice intended?");
    if (optionsOk && options.length > 0 && correct.length === options.length) warn(".correct_answers", "Every option is marked correct.");
  }

  // explanation / image
  let explanation: string | null = null;
  if (q.explanation !== undefined && q.explanation !== null) {
    if (typeof q.explanation !== "string") err(".explanation", '"explanation" must be a string or null.');
    else explanation = q.explanation.trim() ? q.explanation : null;
  }
  let imageUrl: string | null = null;
  if (q.image !== undefined && q.image !== null) {
    if (typeof q.image !== "string" || !/^https?:\/\/\S+$/i.test(q.image)) {
      err(".image", '"image" must be null or a full http(s) URL. Images can be attached from the dashboard after the import.');
    } else imageUrl = q.image;
  }
  let imageAlt: string | null = null;
  if (q.image_alt !== undefined && q.image_alt !== null) {
    if (typeof q.image_alt !== "string") err(".image_alt", '"image_alt" must be a string or null.');
    else imageAlt = q.image_alt || null;
  }

  const unknown = Object.keys(q).filter((k) => !QUESTION_KEYS.has(k));
  if (unknown.length) warn("", `Unknown field(s) ignored: ${unknown.join(", ")}.`);

  if (sink.errors.length > before) return null;
  return {
    index,
    external_id: externalId!,
    type: type as QuestionType,
    text: q.text as string,
    options,
    correct_labels: correct,
    explanation,
    image_url: imageUrl,
    image_alt: imageAlt,
  };
}

export function validateImport(raw: unknown): ParsedImport {
  const sink: Sink = { errors: [], warnings: [] };
  const out: ParsedImport = { subject: null, total_in_file: 0, questions: [], ...sink };

  if (!isObj(raw)) {
    sink.errors.push({ path: "$", message: 'The file must be a JSON object with a "subject" and a "questions" array.' });
    return out;
  }
  const extra = Object.keys(raw).filter((k) => k !== "subject" && k !== "questions");
  if (extra.length) sink.warnings.push({ path: "$", message: `Unknown top-level field(s) ignored: ${extra.join(", ")}.` });

  const s = raw.subject;
  if (!isObj(s)) {
    sink.errors.push({ path: "subject", message: '"subject" must be an object like {"name": "Computer Networking", "code": "NET101"}.' });
  } else {
    const name = typeof s.name === "string" ? s.name.trim() : "";
    if (!name) sink.errors.push({ path: "subject.name", message: '"subject.name" must be a non-empty string.' });
    let code: string | null = null;
    if (s.code !== undefined && s.code !== null && s.code !== "") {
      if (typeof s.code !== "string" || !s.code.trim()) sink.errors.push({ path: "subject.code", message: '"subject.code" must be a string or null.' });
      else code = s.code.trim();
    }
    if (name) out.subject = { name, code };
  }

  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    sink.errors.push({ path: "questions", message: '"questions" must be a non-empty array.' });
    return out;
  }
  if (raw.questions.length > MAX_IMPORT_QUESTIONS) {
    sink.errors.push({ path: "questions", message: `A single file can contain at most ${MAX_IMPORT_QUESTIONS} questions.` });
    return out;
  }
  out.total_in_file = raw.questions.length;

  const seenIds = new Map<string, number>();
  const seenText = new Map<string, number>();
  raw.questions.forEach((rawQ, i) => {
    const index = i + 1;
    const parsed = validateQuestionObject(rawQ, index, sink);
    const id = isObj(rawQ) && typeof rawQ.external_id === "string" ? rawQ.external_id : null;
    if (id) {
      const first = seenIds.get(id);
      if (first !== undefined) {
        sink.errors.push({ path: `questions[${i}].external_id`, message: `external_id "${id}" is already used by question #${first} in this file.`, question_index: index, external_id: id });
        return;
      }
      seenIds.set(id, index);
    }
    if (!parsed) return;
    const key = normalizeForCompare(parsed.text);
    const twin = seenText.get(key);
    if (twin !== undefined) {
      sink.warnings.push({ path: `questions[${i}].text`, message: `Same wording as question #${twin} in this file (possible duplicate).`, question_index: index, external_id: parsed.external_id });
    } else seenText.set(key, index);
    out.questions.push(parsed);
  });
  return out;
}
