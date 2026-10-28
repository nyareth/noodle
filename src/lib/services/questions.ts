import { randomUUID } from "node:crypto";
import { ApiError, isUniqueViolation } from "../errors";
import { query, queryOne, tx, type Db } from "../db";
import type { QuestionType } from "../grading";
import type { ParsedQuestion } from "../import-validation";
import { discardImage, gcImage, imageSrc, storeImage } from "./images";
import { isUuid } from "../util";

export type QuestionContent = Omit<ParsedQuestion, "index">;


/** Replace a question's options and answer key (labels are matched exactly as supplied). */
export async function writeOptions(db: Db, questionId: string, options: { label: string; text: string }[], correctLabels: string[]) {
  await db.query("DELETE FROM answer_options WHERE question_id = $1", [questionId]);
  const ids = options.map(() => randomUUID());
  await db.query(
    `INSERT INTO answer_options (id, question_id, position, label, text)
     SELECT t.id, $1::uuid, t.pos, t.label, t.text FROM unnest($2::uuid[], $3::int[], $4::text[], $5::text[]) AS t(id, pos, label, text)`,
    [questionId, ids, options.map((_, i) => i), options.map((o) => o.label), options.map((o) => o.text)],
  );
  const correctIds = options.flatMap((o, i) => (correctLabels.includes(o.label) ? [ids[i]] : []));
  await db.query(
    "INSERT INTO question_correct_answers (question_id, option_id) SELECT $1::uuid, unnest($2::uuid[])",
    [questionId, correctIds],
  );
}

export async function insertQuestion(db: Db, subjectId: string, q: QuestionContent): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO questions (subject_id, external_id, type, text, explanation, image_url, image_alt)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [subjectId, q.external_id, q.type, q.text, q.explanation, q.image_url, q.image_alt],
    db,
  );
  await writeOptions(db, row!.id, q.options, q.correct_labels);
  return row!.id;
}

/** `fromImport`: an import must not wipe an image/alt text that was attached from the dashboard. */
export async function updateQuestionContent(db: Db, id: string, q: QuestionContent, fromImport: boolean) {
  await db.query(
    `UPDATE questions SET external_id = $2, type = $3, text = $4, explanation = $5,
            image_alt = ${fromImport ? "COALESCE($6, image_alt)" : "$6"}, updated_at = now()
      WHERE id = $1`,
    [id, q.external_id, q.type, q.text, q.explanation, q.image_alt],
  );
  if (fromImport && q.image_url) await db.query("UPDATE questions SET image_url = $2, image_key = NULL WHERE id = $1", [id, q.image_url]);
  await writeOptions(db, id, q.options, q.correct_labels);
}

export interface QuestionListRow {
  id: string;
  external_id: string;
  type: QuestionType;
  text: string;
  active: boolean;
  has_image: boolean;
  option_count: number;
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
}

export async function listQuestions(f: { subjectId?: string; search?: string; active?: boolean; page: number; perPage: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.subjectId && isUuid(f.subjectId)) { params.push(f.subjectId); where.push(`q.subject_id = $${params.length}`); }
  if (f.search) {
    params.push(`%${f.search.replace(/[\\%_]/g, "\\$&")}%`);
    const n = params.length;
    where.push(`(q.text ILIKE $${n} OR q.external_id ILIKE $${n} OR EXISTS (SELECT 1 FROM answer_options o WHERE o.question_id = q.id AND o.text ILIKE $${n}))`);
  }
  if (f.active !== undefined) { params.push(f.active); where.push(`q.active = $${params.length}`); }
  params.push(f.perPage, (f.page - 1) * f.perPage);
  const rows = await query<QuestionListRow & { total: number }>(
    `SELECT q.id, q.external_id, q.type, q.text, q.active,
            (q.image_key IS NOT NULL OR q.image_url IS NOT NULL) AS has_image,
            (SELECT count(*) FROM answer_options o WHERE o.question_id = q.id) AS option_count,
            s.id AS subject_id, s.name AS subject_name, s.code AS subject_code,
            count(*) OVER () AS total
       FROM questions q JOIN subjects s ON s.id = q.subject_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY lower(s.name), q.seq
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: rows[0]?.total ?? 0 };
}

export interface QuestionDetail {
  id: string;
  subject_id: string;
  subject_name: string;
  external_id: string;
  type: QuestionType;
  text: string;
  explanation: string | null;
  active: boolean;
  image_key: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_src: string | null;
  options: { id: string; label: string; text: string; correct: boolean }[];
}

export async function getQuestionDetail(id: string): Promise<QuestionDetail | null> {
  if (!isUuid(id)) return null;
  const q = await queryOne<Omit<QuestionDetail, "options" | "image_src">>(
    `SELECT q.id, q.subject_id, s.name AS subject_name, q.external_id, q.type, q.text, q.explanation, q.active,
            q.image_key, q.image_url, q.image_alt
       FROM questions q JOIN subjects s ON s.id = q.subject_id WHERE q.id = $1`,
    [id],
  );
  if (!q) return null;
  const options = await query<QuestionDetail["options"][number]>(
    `SELECT o.id, o.label, o.text, (c.option_id IS NOT NULL) AS correct
       FROM answer_options o
       LEFT JOIN question_correct_answers c ON c.question_id = o.question_id AND c.option_id = o.id
      WHERE o.question_id = $1 ORDER BY o.position`,
    [id],
  );
  return { ...q, image_src: imageSrc(q.image_key, q.image_url), options };
}

export async function updateQuestion(id: string, content: QuestionContent, active: boolean | undefined) {
  try {
    await tx(async (db) => {
      const exists = await queryOne<{ id: string }>("SELECT id FROM questions WHERE id = $1 FOR UPDATE", [id], db);
      if (!exists) throw new ApiError(404, "not_found", "Question not found.");
      await updateQuestionContent(db, id, content, false);
      if (active !== undefined) await db.query("UPDATE questions SET active = $2 WHERE id = $1", [id, active]);
    });
  } catch (e) {
    if (isUniqueViolation(e, "questions_subject_external_key")) {
      throw new ApiError(409, "external_id_taken", `Another question in this subject already uses the id "${content.external_id}".`);
    }
    throw e;
  }
  return getQuestionDetail(id);
}

export async function setQuestionActive(id: string, active: boolean) {
  const r = await queryOne<{ id: string }>("UPDATE questions SET active = $2, updated_at = now() WHERE id = $1 RETURNING id", [id, active]);
  if (!r) throw new ApiError(404, "not_found", "Question not found.");
}

export async function deleteQuestion(id: string) {
  if (!isUuid(id)) throw new ApiError(404, "not_found", "Question not found.");
  const row = await queryOne<{ image_key: string | null }>("DELETE FROM questions WHERE id = $1 RETURNING image_key", [id]);
  if (!row) throw new ApiError(404, "not_found", "Question not found.");
  await gcImage(row.image_key);
}

export async function setQuestionImage(id: string, bytes: Buffer, alt: string | null) {
  if (!isUuid(id)) throw new ApiError(404, "not_found", "Question not found.");
  const key = await storeImage(bytes);
  try {
    const previous = await tx(async (db) => {
      const prev = await queryOne<{ image_key: string | null }>("SELECT image_key FROM questions WHERE id = $1 FOR UPDATE", [id], db);
      if (!prev) throw new ApiError(404, "not_found", "Question not found.");
      await db.query(
        "UPDATE questions SET image_key = $2, image_url = NULL, image_alt = COALESCE($3, image_alt), updated_at = now() WHERE id = $1",
        [id, key, alt],
      );
      return prev.image_key;
    });
    await gcImage(previous);
  } catch (e) {
    await discardImage(key);
    throw e;
  }
  return getQuestionDetail(id);
}

export async function removeQuestionImage(id: string) {
  if (!isUuid(id)) throw new ApiError(404, "not_found", "Question not found.");
  const prev = await tx(async (db) => {
    const row = await queryOne<{ image_key: string | null }>("SELECT image_key FROM questions WHERE id = $1 FOR UPDATE", [id], db);
    if (!row) throw new ApiError(404, "not_found", "Question not found.");
    await db.query("UPDATE questions SET image_key = NULL, image_url = NULL, image_alt = NULL, updated_at = now() WHERE id = $1", [id]);
    return row.image_key;
  });
  await gcImage(prev);
  return getQuestionDetail(id);
}

