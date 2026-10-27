import { z } from "zod";
import { ApiError } from "../errors";
import { queryOne, query, tx, pool, type Db } from "../db";
import { validateImport, type ImportIssue, type ParsedImport } from "../import-validation";
import { normalizeForCompare } from "../util";
import { insertQuestion, updateQuestionContent } from "./questions";

export type ImportMode = "skip" | "update";
export const importInput = z.object({
  data: z.unknown(),
  mode: z.enum(["skip", "update"]).default("skip"),
});

export interface PreviewItem {
  index: number;
  external_id: string;
  type: string;
  text: string;
  options: { label: string; text: string; correct: boolean }[];
  explanation: string | null;
  image_url: string | null;
  action: "create" | "update" | "skip";
}
export interface ImportPreview {
  ok: boolean;
  mode: ImportMode;
  total_in_file: number;
  subject: { name: string; code: string | null; status: "new" | "existing"; existing_id?: string; existing_name?: string } | null;
  counts: { create: number; update: number; skip: number };
  errors: ImportIssue[];
  warnings: ImportIssue[];
  items: PreviewItem[];
}

interface SubjectLite { id: string; name: string; code: string | null }

async function resolveSubject(db: Db, s: { name: string; code: string | null }): Promise<{ existing: SubjectLite | null; conflict?: string }> {
  if (s.code) {
    const byCode = await queryOne<SubjectLite>("SELECT id, name, code FROM subjects WHERE lower(code) = lower($1)", [s.code], db);
    if (byCode) return { existing: byCode };
  }
  const byName = await queryOne<SubjectLite>("SELECT id, name, code FROM subjects WHERE lower(name) = lower($1)", [s.name], db);
  if (byName && s.code && byName.code?.toLowerCase() !== s.code.toLowerCase()) {
    return { existing: null, conflict: `A subject named "${byName.name}" already exists with ${byName.code ? `code "${byName.code}"` : "no code"}. Use that code in the file, or rename one of the subjects first.` };
  }
  return { existing: byName };
}

async function plan(db: Db, parsed: ParsedImport, mode: ImportMode) {
  const errors = [...parsed.errors];
  const warnings = [...parsed.warnings];
  let existing: SubjectLite | null = null;
  if (parsed.subject) {
    const r = await resolveSubject(db, parsed.subject);
    existing = r.existing;
    if (r.conflict) errors.push({ path: "subject", message: r.conflict });
    else if (existing && existing.name.toLowerCase() !== parsed.subject.name.toLowerCase()) {
      warnings.push({ path: "subject.name", message: `Subject code "${existing.code}" already exists as "${existing.name}". Questions will be added to it; the name in the file is ignored.` });
    }
  }
  const known = new Map<string, { id: string; text: string }>();
  const knownText = new Map<string, string>();
  if (existing) {
    const rows = await query<{ id: string; external_id: string; text: string }>("SELECT id, external_id, text FROM questions WHERE subject_id = $1", [existing.id], db);
    for (const r of rows) { known.set(r.external_id, r); knownText.set(normalizeForCompare(r.text), r.external_id); }
  }
  const items: PreviewItem[] = parsed.questions.map((q) => {
    const match = known.get(q.external_id);
    const action: PreviewItem["action"] = match ? (mode === "update" ? "update" : "skip") : "create";
    if (!match) {
      const twin = knownText.get(normalizeForCompare(q.text));
      if (twin) warnings.push({ path: `questions[${q.index - 1}].text`, message: `Same wording as the existing question "${twin}" (possible duplicate with a different external_id).`, question_index: q.index, external_id: q.external_id });
    }
    return {
      index: q.index, external_id: q.external_id, type: q.type, text: q.text,
      options: q.options.map((o) => ({ ...o, correct: q.correct_labels.includes(o.label) })),
      explanation: q.explanation, image_url: q.image_url, action,
    };
  });
  const counts = { create: 0, update: 0, skip: 0 };
  for (const i of items) counts[i.action]++;
  return { errors, warnings, existing, items, counts };
}

export async function previewImport(raw: unknown, mode: ImportMode): Promise<ImportPreview> {
  const parsed = validateImport(raw);
  const p = await plan(pool, parsed, mode);
  return {
    ok: p.errors.length === 0,
    mode,
    total_in_file: parsed.total_in_file,
    subject: parsed.subject
      ? { ...parsed.subject, status: p.existing ? "existing" : "new", existing_id: p.existing?.id, existing_name: p.existing?.name }
      : null,
    counts: p.counts,
    errors: p.errors,
    warnings: p.warnings,
    items: p.items,
  };
}

export async function commitImport(raw: unknown, mode: ImportMode) {
  const parsed = validateImport(raw);
  return tx(async (db) => {
    const p = await plan(db, parsed, mode);
    if (p.errors.length || !parsed.subject) {
      throw new ApiError(422, "invalid_import", "The file still has validation errors. Fix them and preview again.", { errors: p.errors });
    }
    let subjectId = p.existing?.id;
    if (!subjectId) {
      const row = await queryOne<{ id: string }>("INSERT INTO subjects (code, name) VALUES ($1, $2) RETURNING id", [parsed.subject.code, parsed.subject.name], db);
      subjectId = row!.id;
    }
    const existingIds = new Map(
      (await query<{ id: string; external_id: string }>("SELECT id, external_id FROM questions WHERE subject_id = $1", [subjectId], db)).map((r) => [r.external_id, r.id]),
    );
    const result = { subject_id: subjectId, subject_name: p.existing?.name ?? parsed.subject.name, created: 0, updated: 0, skipped: 0 };
    for (const q of parsed.questions) {
      const existingId = existingIds.get(q.external_id);
      if (!existingId) { await insertQuestion(db, subjectId, q); result.created++; }
      else if (mode === "update") { await updateQuestionContent(db, existingId, q, true); result.updated++; }
      else result.skipped++;
    }
    return result;
  });
}
