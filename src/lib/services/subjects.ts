import { z } from "zod";
import { query, queryOne } from "../db";
import { ApiError, isUniqueViolation } from "../errors";
import type { QuestionType } from "../grading";
import { isUuid } from "../util";

export const REVIEW_POLICIES = ["score_only", "correctness", "answers", "full"] as const;
export type ReviewPolicy = (typeof REVIEW_POLICIES)[number];

/** A question can appear in attempts when it is enabled and has an answer key. (Alias `q` = questions.) */
export const ELIGIBLE_SQL = `q.active AND EXISTS (SELECT 1 FROM question_correct_answers a WHERE a.question_id = q.id)`;

export const subjectInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  code: z.string().trim().max(50).nullish().transform((v) => v || null),
  description: z.string().trim().max(2000).nullish().transform((v) => v || null),
  time_per_question_seconds: z.number().int().min(5).max(3600).nullish().transform((v) => v ?? null),
  review_policy: z.enum(REVIEW_POLICIES).default("full"),
  questions_per_page: z.number().int().min(1).max(100).default(1),
  shuffle_options: z.boolean().default(false),
});
export type SubjectInput = z.output<typeof subjectInput>;

export interface SubjectRow {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  time_per_question_seconds: number | null;
  review_policy: ReviewPolicy;
  questions_per_page: number;
  shuffle_options: boolean;
  available_questions: number;
  total_questions: number;
  attempt_count: number;
}

const COLUMNS = `s.id, s.code, s.name, s.description, s.time_per_question_seconds, s.review_policy, s.questions_per_page, s.shuffle_options,
  (SELECT count(*) FROM questions q WHERE q.subject_id = s.id AND ${ELIGIBLE_SQL}) AS available_questions,
  (SELECT count(*) FROM questions q WHERE q.subject_id = s.id) AS total_questions,
  (SELECT count(*) FROM attempts a WHERE a.subject_id = s.id) AS attempt_count`;

export const listSubjects = () => query<SubjectRow>(`SELECT ${COLUMNS} FROM subjects s ORDER BY lower(s.name)`);

export async function getSubject(id: string): Promise<SubjectRow | null> {
  if (!isUuid(id)) return null;
  return queryOne<SubjectRow>(`SELECT ${COLUMNS} FROM subjects s WHERE s.id = $1`, [id]);
}

export type StudentSubject = SubjectRow & { my_attempts: number; my_best_percent: number | null };

/** Subjects that have at least one question students can be given. */
export const listSubjectsForStudent = (userId: string) =>
  query<StudentSubject>(
    `SELECT ${COLUMNS},
        (SELECT count(*) FROM attempts a WHERE a.subject_id = s.id AND a.user_id = $1 AND a.status = 'finished') AS my_attempts,
        (SELECT max(a.score_percent) FROM attempts a WHERE a.subject_id = s.id AND a.user_id = $1 AND a.status = 'finished') AS my_best_percent
       FROM subjects s
      WHERE EXISTS (SELECT 1 FROM questions q WHERE q.subject_id = s.id AND ${ELIGIBLE_SQL})
      ORDER BY lower(s.name)`,
    [userId],
  );

function mapConflict(e: unknown): unknown {
  if (isUniqueViolation(e, "subjects_code_key")) return new ApiError(409, "subject_code_exists", "Another subject already uses that code.");
  if (isUniqueViolation(e, "subjects_name_key")) return new ApiError(409, "subject_name_exists", "Another subject already has that name.");
  return e;
}

const values = (i: SubjectInput) => [i.code, i.name, i.description, i.time_per_question_seconds, i.review_policy, i.questions_per_page, i.shuffle_options];

export async function createSubject(input: SubjectInput): Promise<SubjectRow> {
  try {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO subjects (code, name, description, time_per_question_seconds, review_policy, questions_per_page, shuffle_options)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      values(input),
    );
    return (await getSubject(row!.id))!;
  } catch (e) {
    throw mapConflict(e);
  }
}

export async function updateSubject(id: string, input: SubjectInput): Promise<SubjectRow> {
  if (!isUuid(id)) throw new ApiError(404, "not_found", "Subject not found.");
  try {
    const row = await queryOne<{ id: string }>(
      `UPDATE subjects SET code = $2, name = $3, description = $4, time_per_question_seconds = $5, review_policy = $6,
              questions_per_page = $7, shuffle_options = $8, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [id, ...values(input)],
    );
    if (!row) throw new ApiError(404, "not_found", "Subject not found.");
    return (await getSubject(id))!;
  } catch (e) {
    throw mapConflict(e);
  }
}

export interface SubjectExportQuestion {
  external_id: string;
  text: string;
  type: QuestionType;
  options: { label: string; text: string }[];
  correct_answers: string[];
  explanation: string | null;
  image: string | null;
  image_alt: string | null;
}
export interface SubjectExport {
  subject: { name: string; code: string | null };
  questions: SubjectExportQuestion[];
}

/** Safe download name, e.g. "Intro to Python.json". */
export function subjectExportFilename(name: string) {
  const base = name.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim() || "questions";
  return `${base}.json`;
}

const exportableImage = (url: string | null) => (url && /^https?:\/\/\S+$/i.test(url) ? url : null);

/** Question bank in the same JSON shape the admin import page accepts. */
export async function exportSubjectQuestions(id: string): Promise<{ filename: string; body: SubjectExport }> {
  const subject = await getSubject(id);
  if (!subject) throw new ApiError(404, "not_found", "Subject not found.");
  const questions = await query<{
    id: string;
    external_id: string;
    type: QuestionType;
    text: string;
    explanation: string | null;
    image_url: string | null;
    image_alt: string | null;
  }>("SELECT id, external_id, type, text, explanation, image_url, image_alt FROM questions WHERE subject_id = $1 ORDER BY seq", [id]);
  const options = questions.length
    ? await query<{ question_id: string; label: string; text: string; correct: boolean }>(
        `SELECT o.question_id, o.label, o.text, (c.option_id IS NOT NULL) AS correct
           FROM answer_options o
           LEFT JOIN question_correct_answers c ON c.question_id = o.question_id AND c.option_id = o.id
          WHERE o.question_id = ANY($1::uuid[])
          ORDER BY o.question_id, o.position`,
        [questions.map((q) => q.id)],
      )
    : [];
  const byQuestion = new Map<string, typeof options>();
  for (const o of options) {
    const list = byQuestion.get(o.question_id);
    if (list) list.push(o);
    else byQuestion.set(o.question_id, [o]);
  }
  return {
    filename: subjectExportFilename(subject.name),
    body: {
      subject: { name: subject.name, code: subject.code },
      questions: questions.map((q) => {
        const opts = byQuestion.get(q.id) ?? [];
        return {
          external_id: q.external_id,
          text: q.text,
          type: q.type,
          options: opts.map(({ label, text }) => ({ label, text })),
          correct_answers: opts.filter((o) => o.correct).map((o) => o.label),
          explanation: q.explanation,
          image: exportableImage(q.image_url),
          image_alt: q.image_alt,
        };
      }),
    },
  };
}

/** Deletes the subject and its questions. Past attempts are kept (they hold their own frozen copy). */
export async function deleteSubject(id: string) {
  const s = await getSubject(id);
  if (!s) throw new ApiError(404, "not_found", "Subject not found.");
  await query("DELETE FROM subjects WHERE id = $1", [id]);
  return { deleted_questions: s.total_questions, kept_attempts: s.attempt_count };
}
