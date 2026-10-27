import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, query, queryOne, tx, type Db } from "../db";
import { env } from "../env";
import { ApiError } from "../errors";
import { isQuestionCorrect, scorePercent, type QuestionType } from "../grading";
import { optionHtml, richTextToHtml } from "../richtext";
import { UUID_RE, isUuid, shuffle } from "../util";
import { imageSrc } from "./questions";
import { ELIGIBLE_SQL, type ReviewPolicy } from "./subjects";

/* ------------------------------------------------------------------ input schemas */
const uuidString = z.string().regex(UUID_RE, "Invalid id");
export const startAttemptInput = z.object({ subject_id: uuidString, question_count: z.number().int().min(1).max(10_000) });
export const answerInput = z.object({ selected: z.array(uuidString).max(30) });
export const flagInput = z.object({ flagged: z.boolean() });
export const submitInput = z.object({
  answers: z.record(uuidString, z.array(uuidString).max(30)).optional(),
  flags: z.record(uuidString, z.boolean()).optional(),
});
export type SubmitInput = z.output<typeof submitInput>;

/* ------------------------------------------------------------------ types */
interface AttemptRow {
  id: string;
  user_id: string;
  subject_id: string | null;
  subject_name: string;
  subject_code: string | null;
  status: "in_progress" | "finished";
  finish_reason: "submitted" | "time_expired" | null;
  review_policy: ReviewPolicy;
  questions_per_page: number;
  time_limit_seconds: number | null;
  started_at: Date;
  deadline_at: Date | null;
  finished_at: Date | null;
  total_questions: number;
  correct_count: number | null;
  score_percent: number | null;
  seconds_left: number | null;
  expired: boolean;
}

export interface AttemptSummary {
  id: string;
  subject_id: string | null;
  subject_name: string;
  subject_code: string | null;
  status: "in_progress" | "finished";
  finish_reason: "submitted" | "time_expired" | null;
  review_policy: ReviewPolicy;
  questions_per_page: number;
  time_limit_seconds: number | null;
  started_at: string;
  finished_at: string | null;
  deadline_at: string | null;
  total_questions: number;
  correct_count: number | null;
  score_percent: number | null;
}

export interface QuestionImage { url: string; alt: string | null }
export interface TakingQuestion {
  id: string; // attempt_questions.id
  position: number;
  type: QuestionType;
  html: string;
  image: QuestionImage | null;
  options: { id: string; html: string }[];
  selected: string[];
  flagged: boolean;
}
/** What an in-progress attempt exposes: no score fields at all (they only exist after submission). */
export type TakingSummary = Omit<AttemptSummary, "correct_count" | "score_percent" | "finished_at" | "finish_reason">;
export interface TakingPayload {
  attempt: TakingSummary & { server_time: string; seconds_left: number | null; answer_numbering: string; timezone: string };
  questions: TakingQuestion[];
}

export interface ReviewOption { id: string; html: string; selected: boolean; is_correct?: boolean; selected_correct?: boolean }
export interface ReviewQuestion {
  id: string;
  position: number;
  type: QuestionType;
  html: string;
  image: QuestionImage | null;
  flagged: boolean;
  answered: boolean;
  options: ReviewOption[];
  is_correct?: boolean;
  right_answer_html?: string[];
  explanation_html?: string | null;
}
export interface ReviewPayload {
  attempt: AttemptSummary & { timezone: string; answer_numbering: string };
  student?: { id: string; name: string; email: string };
  review_available: boolean;
  shows: { correctness: boolean; answers: boolean; explanation: boolean };
  questions: ReviewQuestion[];
}

export interface AttemptResult {
  attempt_id: string;
  status: "finished";
  finish_reason: "submitted" | "time_expired";
  correct_count: number;
  total_questions: number;
  score_percent: number;
}

/* ------------------------------------------------------------------ helpers */
const iso = (d: Date | null) => (d ? d.toISOString() : null);

const toSummary = (a: AttemptRow): AttemptSummary => ({
  id: a.id,
  subject_id: a.subject_id,
  subject_name: a.subject_name,
  subject_code: a.subject_code,
  status: a.status,
  finish_reason: a.finish_reason,
  review_policy: a.review_policy,
  questions_per_page: a.questions_per_page,
  time_limit_seconds: a.time_limit_seconds,
  started_at: a.started_at.toISOString(),
  finished_at: iso(a.finished_at),
  deadline_at: iso(a.deadline_at),
  total_questions: a.total_questions,
  correct_count: a.correct_count,
  score_percent: a.score_percent,
});

function takingSummary(a: AttemptRow): TakingSummary {
  const { correct_count: _c, score_percent: _s, finished_at: _f, finish_reason: _r, ...rest } = toSummary(a);
  void _c; void _s; void _f; void _r;
  return rest;
}

const image = (key: string | null, url: string | null, alt: string | null): QuestionImage | null => {
  const src = imageSrc(key, url);
  return src ? { url: src, alt } : null;
};

const ATTEMPT_SQL = `SELECT a.*,
    EXTRACT(EPOCH FROM (a.deadline_at - now()))::float8 AS seconds_left,
    (a.deadline_at IS NOT NULL AND now() > a.deadline_at + make_interval(secs => $3::int)) AS expired
  FROM attempts a`;

/** `userId = null` skips the ownership check (admin use only). */
async function fetchAttempt(db: Db, attemptId: string, userId: string | null, lock = false): Promise<AttemptRow | null> {
  if (!isUuid(attemptId)) return null;
  return queryOne<AttemptRow>(
    `${ATTEMPT_SQL} WHERE a.id = $1 AND ($2::uuid IS NULL OR a.user_id = $2::uuid)${lock ? " FOR UPDATE OF a" : ""}`,
    [attemptId, userId, env.deadlineGraceSeconds],
    db,
  );
}

const resultOf = (a: AttemptRow): AttemptResult => ({
  attempt_id: a.id,
  status: "finished",
  finish_reason: a.finish_reason!,
  correct_count: a.correct_count!,
  total_questions: a.total_questions,
  score_percent: a.score_percent!,
});

/* ------------------------------------------------------------------ start */
export async function startAttempt(userId: string, subjectId: string, count: number): Promise<{ attempt_id: string; total_questions: number }> {
  if (count > env.maxQuestionsPerAttempt) {
    throw new ApiError(422, "too_many_requested", `An attempt can have at most ${env.maxQuestionsPerAttempt} questions.`, { max: env.maxQuestionsPerAttempt });
  }
  return tx(async (db) => {
    // Serialise double-clicks on "Start" for the same person and subject.
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`start:${userId}:${subjectId}`]);

    const subject = await queryOne<{
      id: string; name: string; code: string | null; time_per_question_seconds: number | null;
      review_policy: ReviewPolicy; questions_per_page: number; shuffle_options: boolean;
    }>("SELECT id, name, code, time_per_question_seconds, review_policy, questions_per_page, shuffle_options FROM subjects WHERE id = $1", [subjectId], db);
    if (!subject) throw new ApiError(404, "subject_not_found", "Subject not found.");

    const recent = await queryOne<{ id: string }>(
      `SELECT id FROM attempts WHERE user_id = $1 AND subject_id = $2 AND status = 'in_progress'
          AND total_questions = $3 AND started_at > now() - interval '5 seconds' LIMIT 1`,
      [userId, subjectId, count],
      db,
    );
    if (recent) return { attempt_id: recent.id, total_questions: count };

    const avail = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM questions q WHERE q.subject_id = $1 AND ${ELIGIBLE_SQL}`, [subjectId], db);
    const available = avail!.n;
    if (available === 0) throw new ApiError(422, "no_questions", "This subject has no questions yet.", { available: 0 });
    if (count > available) {
      throw new ApiError(422, "not_enough_questions", `Only ${available} question${available === 1 ? " is" : "s are"} available for this subject.`, { available, requested: count });
    }

    // The server chooses the questions: a random sample, in random order.
    const picked = await query<{
      id: string; external_id: string; type: QuestionType; text: string; explanation: string | null;
      image_key: string | null; image_url: string | null; image_alt: string | null;
    }>(
      `SELECT q.id, q.external_id, q.type, q.text, q.explanation, q.image_key, q.image_url, q.image_alt
         FROM questions q WHERE q.subject_id = $1 AND ${ELIGIBLE_SQL} ORDER BY random() LIMIT $2`,
      [subjectId, count],
      db,
    );
    const ids = picked.map((q) => q.id);
    const opts = await query<{ id: string; question_id: string; position: number; label: string; text: string }>(
      "SELECT id, question_id, position, label, text FROM answer_options WHERE question_id = ANY($1::uuid[]) ORDER BY question_id, position",
      [ids],
      db,
    );
    const keyRows = await query<{ question_id: string; option_id: string }>(
      "SELECT question_id, option_id FROM question_correct_answers WHERE question_id = ANY($1::uuid[])",
      [ids],
      db,
    );
    const correctByQuestion = new Map<string, Set<string>>();
    for (const k of keyRows) {
      if (!correctByQuestion.has(k.question_id)) correctByQuestion.set(k.question_id, new Set());
      correctByQuestion.get(k.question_id)!.add(k.option_id);
    }
    const optionsByQuestion = new Map<string, typeof opts>();
    for (const o of opts) {
      if (!optionsByQuestion.has(o.question_id)) optionsByQuestion.set(o.question_id, []);
      optionsByQuestion.get(o.question_id)!.push(o);
    }

    const attemptId = randomUUID();
    const limit = subject.time_per_question_seconds ? subject.time_per_question_seconds * picked.length : null;
    await db.query(
      `INSERT INTO attempts (id, user_id, subject_id, subject_name, subject_code, review_policy, questions_per_page,
                             time_limit_seconds, deadline_at, total_questions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::int,
               CASE WHEN $8::int IS NULL THEN NULL ELSE now() + make_interval(secs => $8::int) END, $9)`,
      [attemptId, userId, subject.id, subject.name, subject.code, subject.review_policy, subject.questions_per_page, limit, picked.length],
    );

    // Freeze the questions, their displayed option order and the answer key for this attempt.
    const aqIds = picked.map(() => randomUUID());
    await db.query(
      `INSERT INTO attempt_questions (id, attempt_id, position, question_id, external_id, type, text, explanation, image_key, image_url, image_alt)
       SELECT t.id, $1::uuid, t.pos, t.qid, t.ext, t.type, t.text, t.expl, t.ikey, t.iurl, t.ialt
         FROM unnest($2::uuid[], $3::int[], $4::uuid[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[])
              AS t(id, pos, qid, ext, type, text, expl, ikey, iurl, ialt)`,
      [
        attemptId, aqIds, picked.map((_, i) => i + 1), ids, picked.map((q) => q.external_id), picked.map((q) => q.type),
        picked.map((q) => q.text), picked.map((q) => q.explanation), picked.map((q) => q.image_key),
        picked.map((q) => q.image_url), picked.map((q) => q.image_alt),
      ],
    );

    const rows: { id: string; aq: string; pos: number; label: string; text: string; option: string; correct: boolean }[] = [];
    picked.forEach((q, qi) => {
      const list = optionsByQuestion.get(q.id) ?? [];
      const shown = subject.shuffle_options ? shuffle(list) : list;
      shown.forEach((o, pos) => rows.push({ id: randomUUID(), aq: aqIds[qi], pos, label: o.label, text: o.text, option: o.id, correct: correctByQuestion.get(q.id)?.has(o.id) ?? false }));
    });
    await db.query(
      `INSERT INTO attempt_options (id, attempt_question_id, position, label, text, option_id)
       SELECT t.id, t.aq, t.pos, t.label, t.text, t.option FROM unnest($1::uuid[], $2::uuid[], $3::int[], $4::text[], $5::text[], $6::uuid[])
              AS t(id, aq, pos, label, text, option)`,
      [rows.map((r) => r.id), rows.map((r) => r.aq), rows.map((r) => r.pos), rows.map((r) => r.label), rows.map((r) => r.text), rows.map((r) => r.option)],
    );
    const key = rows.filter((r) => r.correct);
    await db.query(
      "INSERT INTO attempt_correct_options (attempt_question_id, attempt_option_id) SELECT * FROM unnest($1::uuid[], $2::uuid[])",
      [key.map((r) => r.aq), key.map((r) => r.id)],
    );
    return { attempt_id: attemptId, total_questions: picked.length };
  });
}

/* ------------------------------------------------------------------ grading */
async function gradeAndFinish(db: Db, attemptId: string, reason: "submitted" | "time_expired") {
  const rows = await query<{ id: string; type: QuestionType; selected: string[]; correct: string[] }>(
    `SELECT aq.id, aq.type,
            COALESCE((SELECT array_agg(r.attempt_option_id) FROM attempt_responses r WHERE r.attempt_question_id = aq.id), '{}') AS selected,
            COALESCE((SELECT array_agg(k.attempt_option_id) FROM attempt_correct_options k WHERE k.attempt_question_id = aq.id), '{}') AS correct
       FROM attempt_questions aq WHERE aq.attempt_id = $1 ORDER BY aq.position`,
    [attemptId],
    db,
  );
  const verdicts = rows.map((r) => isQuestionCorrect(r.type, r.selected, r.correct));
  const correctCount = verdicts.filter(Boolean).length;
  await db.query(
    "UPDATE attempt_questions AS aq SET is_correct = v.ok FROM unnest($1::uuid[], $2::bool[]) AS v(id, ok) WHERE aq.id = v.id",
    [rows.map((r) => r.id), verdicts],
  );
  await db.query(
    `UPDATE attempts SET status = 'finished', finish_reason = $2,
            finished_at = CASE WHEN deadline_at IS NOT NULL AND now() > deadline_at THEN deadline_at ELSE now() END,
            correct_count = $3, score_percent = $4
      WHERE id = $1`,
    [attemptId, reason, correctCount, scorePercent(correctCount, rows.length)],
  );
}

/** Closes an attempt whose server-side deadline (plus grace) has passed, grading what was saved. */
export async function finalizeIfExpired(attemptId: string): Promise<boolean> {
  return tx(async (db) => {
    const a = await fetchAttempt(db, attemptId, null, true);
    if (a && a.status === "in_progress" && a.expired) { await gradeAndFinish(db, a.id, "time_expired"); return true; }
    return false;
  });
}

async function settleExpired(userId: string | null) {
  const rows = await query<{ id: string }>(
    `SELECT id FROM attempts WHERE status = 'in_progress' AND deadline_at IS NOT NULL
        AND now() > deadline_at + make_interval(secs => $2::int) AND ($1::uuid IS NULL OR user_id = $1::uuid) LIMIT 200`,
    [userId, env.deadlineGraceSeconds],
  );
  for (const r of rows) await finalizeIfExpired(r.id);
}

/* ------------------------------------------------------------------ writes during an attempt */
type Outcome<T> = { kind: "ok"; value: T } | { kind: "finished" } | { kind: "expired" };

/** Runs `fn` with the attempt row locked, only while the attempt is open and inside its deadline. */
async function withOpenAttempt<T>(userId: string, attemptId: string, fn: (db: Db, a: AttemptRow) => Promise<T>): Promise<T> {
  const out = await tx<Outcome<T>>(async (db) => {
    const a = await fetchAttempt(db, attemptId, userId, true);
    if (!a) throw new ApiError(404, "attempt_not_found", "Attempt not found.");
    if (a.status === "finished") return { kind: "finished" };
    if (a.expired) { await gradeAndFinish(db, a.id, "time_expired"); return { kind: "expired" }; }
    return { kind: "ok", value: await fn(db, a) };
  });
  if (out.kind === "finished") throw new ApiError(409, "attempt_finished", "This attempt has already been submitted.", { attempt_id: attemptId });
  if (out.kind === "expired") throw new ApiError(409, "time_expired", "The time limit has passed. Your saved answers were submitted.", { attempt_id: attemptId });
  return out.value;
}

async function applyAnswer(db: Db, attemptId: string, attemptQuestionId: string, optionIds: string[]) {
  const aq = await queryOne<{ id: string; type: QuestionType }>(
    "SELECT id, type FROM attempt_questions WHERE id = $1 AND attempt_id = $2",
    [attemptQuestionId, attemptId],
    db,
  );
  if (!aq) throw new ApiError(404, "question_not_found", "That question is not part of this attempt.");
  const unique = [...new Set(optionIds)];
  if (aq.type === "single_choice" && unique.length > 1) throw new ApiError(422, "too_many_options", "Only one option can be selected for this question.");
  if (unique.length) {
    const ok = await queryOne<{ n: number }>(
      "SELECT count(*)::int AS n FROM attempt_options WHERE attempt_question_id = $1 AND id = ANY($2::uuid[])",
      [aq.id, unique],
      db,
    );
    if (ok!.n !== unique.length) throw new ApiError(422, "invalid_option", "One of the selected options does not belong to this question.");
  }
  await db.query("DELETE FROM attempt_responses WHERE attempt_question_id = $1", [aq.id]);
  if (unique.length) {
    await db.query("INSERT INTO attempt_responses (attempt_question_id, attempt_option_id) SELECT $1, unnest($2::uuid[])", [aq.id, unique]);
  }
}

/** Replaces the saved selection for one question (idempotent: sending the same set twice changes nothing). */
export const saveAnswer = (userId: string, attemptId: string, attemptQuestionId: string, optionIds: string[]) =>
  withOpenAttempt(userId, attemptId, (db, a) => applyAnswer(db, a.id, attemptQuestionId, optionIds));

export const setFlag = (userId: string, attemptId: string, attemptQuestionId: string, flagged: boolean) =>
  withOpenAttempt(userId, attemptId, async (db, a) => {
    const r = await db.query("UPDATE attempt_questions SET flagged = $3 WHERE id = $1 AND attempt_id = $2", [attemptQuestionId, a.id, flagged]);
    if (!r.rowCount) throw new ApiError(404, "question_not_found", "That question is not part of this attempt.");
  });

/**
 * Finishes and grades the attempt. Safe to call repeatedly (double clicks, retries after a network
 * error): a second call returns the stored result. The optional payload carries the browser's final
 * answers so nothing is lost if an earlier autosave failed.
 */
export async function submitAttempt(userId: string, attemptId: string, input: SubmitInput): Promise<AttemptResult & { already_finished: boolean; late: boolean }> {
  return tx(async (db) => {
    const a = await fetchAttempt(db, attemptId, userId, true);
    if (!a) throw new ApiError(404, "attempt_not_found", "Attempt not found.");
    if (a.status === "finished") return { ...resultOf(a), already_finished: true, late: false };
    if (a.expired) {
      await gradeAndFinish(db, a.id, "time_expired");
      return { ...resultOf((await fetchAttempt(db, a.id, userId))!), already_finished: false, late: true };
    }
    for (const [aqId, optionIds] of Object.entries(input.answers ?? {})) await applyAnswer(db, a.id, aqId, optionIds);
    for (const [aqId, flagged] of Object.entries(input.flags ?? {})) {
      await db.query("UPDATE attempt_questions SET flagged = $3 WHERE id = $1 AND attempt_id = $2", [aqId, a.id, flagged]);
    }
    await gradeAndFinish(db, a.id, "submitted");
    return { ...resultOf((await fetchAttempt(db, a.id, userId))!), already_finished: false, late: false };
  });
}

/* ------------------------------------------------------------------ reads */
/** In-progress view. Contains NO answer key and no per-question verdicts. */
export async function getTakingPayload(
  userId: string,
  attemptId: string,
): Promise<{ state: "missing" } | { state: "finished" } | { state: "taking"; payload: TakingPayload }> {
  const a = await fetchAttempt(pool, attemptId, userId);
  if (!a) return { state: "missing" };
  if (a.status === "in_progress" && a.expired) { await finalizeIfExpired(a.id); return { state: "finished" }; }
  if (a.status === "finished") return { state: "finished" };

  const qs = await query<{ id: string; position: number; type: QuestionType; text: string; image_key: string | null; image_url: string | null; image_alt: string | null; flagged: boolean }>(
    "SELECT id, position, type, text, image_key, image_url, image_alt, flagged FROM attempt_questions WHERE attempt_id = $1 ORDER BY position",
    [a.id],
  );
  const opts = await query<{ id: string; attempt_question_id: string; text: string }>(
    `SELECT o.id, o.attempt_question_id, o.text FROM attempt_options o
       JOIN attempt_questions aq ON aq.id = o.attempt_question_id
      WHERE aq.attempt_id = $1 ORDER BY o.attempt_question_id, o.position`,
    [a.id],
  );
  const chosen = await query<{ attempt_question_id: string; attempt_option_id: string }>(
    `SELECT r.attempt_question_id, r.attempt_option_id FROM attempt_responses r
       JOIN attempt_questions aq ON aq.id = r.attempt_question_id WHERE aq.attempt_id = $1`,
    [a.id],
  );
  const optsBy = new Map<string, { id: string; html: string }[]>();
  for (const o of opts) {
    if (!optsBy.has(o.attempt_question_id)) optsBy.set(o.attempt_question_id, []);
    optsBy.get(o.attempt_question_id)!.push({ id: o.id, html: optionHtml(o.text) });
  }
  const chosenBy = new Map<string, string[]>();
  for (const c of chosen) {
    if (!chosenBy.has(c.attempt_question_id)) chosenBy.set(c.attempt_question_id, []);
    chosenBy.get(c.attempt_question_id)!.push(c.attempt_option_id);
  }
  return {
    state: "taking",
    payload: {
      attempt: { ...takingSummary(a), server_time: new Date().toISOString(), seconds_left: a.seconds_left, answer_numbering: env.answerNumbering, timezone: env.timezone },
      questions: qs.map((q) => ({
        id: q.id,
        position: q.position,
        type: q.type,
        html: richTextToHtml(q.text),
        image: image(q.image_key, q.image_url, q.image_alt),
        options: optsBy.get(q.id) ?? [],
        selected: chosenBy.get(q.id) ?? [],
        flagged: q.flagged,
      })),
    },
  };
}

const RANK: Record<ReviewPolicy, number> = { score_only: 0, correctness: 1, answers: 2, full: 3 };

/**
 * Finished-attempt view. What is revealed follows the attempt's review policy, enforced here on the server.
 * `admin: true` (admin endpoints only) ignores the policy and does not require ownership.
 */
export async function getReviewPayload(attemptId: string, opts: { userId: string } | { admin: true }): Promise<
  { state: "missing" } | { state: "in_progress" } | { state: "ok"; payload: ReviewPayload }
> {
  const admin = "admin" in opts;
  let a = await fetchAttempt(pool, attemptId, admin ? null : opts.userId);
  if (!a) return { state: "missing" };
  if (a.status === "in_progress" && a.expired) { await finalizeIfExpired(a.id); a = await fetchAttempt(pool, attemptId, admin ? null : opts.userId); }
  if (!a) return { state: "missing" };
  if (a.status === "in_progress") return { state: "in_progress" };

  const rank = admin ? 3 : RANK[a.review_policy];
  const base = { ...toSummary(a), timezone: env.timezone, answer_numbering: env.answerNumbering };
  const student = admin ? await queryOne<{ id: string; name: string; email: string }>("SELECT id, name, email FROM users WHERE id = $1", [a.user_id]) : null;
  const shows = { correctness: rank >= 1, answers: rank >= 2, explanation: rank >= 3 };
  if (rank === 0) {
    return { state: "ok", payload: { attempt: base, review_available: false, shows, questions: [], ...(student ? { student } : {}) } };
  }

  const qs = await query<{ id: string; position: number; type: QuestionType; text: string; explanation: string | null; image_key: string | null; image_url: string | null; image_alt: string | null; flagged: boolean; is_correct: boolean | null }>(
    "SELECT id, position, type, text, explanation, image_key, image_url, image_alt, flagged, is_correct FROM attempt_questions WHERE attempt_id = $1 ORDER BY position",
    [a.id],
  );
  const options = await query<{ id: string; attempt_question_id: string; text: string }>(
    `SELECT o.id, o.attempt_question_id, o.text FROM attempt_options o
       JOIN attempt_questions aq ON aq.id = o.attempt_question_id WHERE aq.attempt_id = $1 ORDER BY o.attempt_question_id, o.position`,
    [a.id],
  );
  const chosen = new Set(
    (await query<{ attempt_option_id: string }>(
      `SELECT r.attempt_option_id FROM attempt_responses r JOIN attempt_questions aq ON aq.id = r.attempt_question_id WHERE aq.attempt_id = $1`,
      [a.id],
    )).map((r) => r.attempt_option_id),
  );
  const key = new Set(
    (await query<{ attempt_option_id: string }>(
      `SELECT k.attempt_option_id FROM attempt_correct_options k JOIN attempt_questions aq ON aq.id = k.attempt_question_id WHERE aq.attempt_id = $1`,
      [a.id],
    )).map((r) => r.attempt_option_id),
  );
  const optsBy = new Map<string, typeof options>();
  for (const o of options) {
    if (!optsBy.has(o.attempt_question_id)) optsBy.set(o.attempt_question_id, []);
    optsBy.get(o.attempt_question_id)!.push(o);
  }

  const questions: ReviewQuestion[] = qs.map((q) => {
    const list = optsBy.get(q.id) ?? [];
    const rq: ReviewQuestion = {
      id: q.id,
      position: q.position,
      type: q.type,
      html: richTextToHtml(q.text),
      image: image(q.image_key, q.image_url, q.image_alt),
      flagged: q.flagged,
      answered: list.some((o) => chosen.has(o.id)),
      options: list.map((o) => {
        const selected = chosen.has(o.id);
        const ro: ReviewOption = { id: o.id, html: optionHtml(o.text), selected };
        if (shows.correctness && selected) ro.selected_correct = key.has(o.id);
        if (shows.answers) ro.is_correct = key.has(o.id);
        return ro;
      }),
    };
    if (shows.correctness) rq.is_correct = q.is_correct ?? false;
    if (shows.answers) rq.right_answer_html = list.filter((o) => key.has(o.id)).map((o) => optionHtml(o.text));
    if (shows.explanation) rq.explanation_html = q.explanation ? richTextToHtml(q.explanation) : null;
    return rq;
  });
  return { state: "ok", payload: { attempt: base, review_available: true, shows, questions, ...(student ? { student } : {}) } };
}

/* ------------------------------------------------------------------ lists */
export async function listAttemptsForUser(userId: string, subjectId?: string): Promise<AttemptSummary[]> {
  await settleExpired(userId);
  const rows = await query<AttemptRow>(
    `${ATTEMPT_SQL} WHERE a.user_id = $1::uuid AND ($2::uuid IS NULL OR a.subject_id = $2::uuid) ORDER BY a.started_at DESC LIMIT 300`,
    [userId, subjectId ?? null, env.deadlineGraceSeconds],
  );
  return rows.map(toSummary);
}

export interface AdminAttemptRow {
  id: string;
  status: "in_progress" | "finished";
  started_at: string;
  finished_at: string | null;
  total_questions: number;
  correct_count: number | null;
  score_percent: number | null;
  subject_name: string;
  subject_code: string | null;
  user_id: string;
  user_name: string;
  user_email: string;
}

export async function listAttemptsAdmin(f: { subjectId?: string; userId?: string; status?: string; page: number; perPage: number }) {
  await settleExpired(null);
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.subjectId && isUuid(f.subjectId)) { params.push(f.subjectId); where.push(`a.subject_id = $${params.length}`); }
  if (f.userId && isUuid(f.userId)) { params.push(f.userId); where.push(`a.user_id = $${params.length}`); }
  if (f.status === "finished" || f.status === "in_progress") { params.push(f.status); where.push(`a.status = $${params.length}`); }
  params.push(f.perPage, (f.page - 1) * f.perPage);
  const rows = await query<AdminAttemptRow & { total: number }>(
    `SELECT a.id, a.status, a.started_at, a.finished_at, a.total_questions, a.correct_count, a.score_percent,
            a.subject_name, a.subject_code, u.id AS user_id, u.name AS user_name, u.email AS user_email, count(*) OVER () AS total
       FROM attempts a JOIN users u ON u.id = a.user_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY a.started_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows, total: rows[0]?.total ?? 0 };
}
