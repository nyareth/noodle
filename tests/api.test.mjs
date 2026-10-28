// End-to-end API tests. Needs a running server (npm run build && npm start, or npm run dev) and a migrated + seeded DB.
//   BASE_URL=http://localhost:3000 npm test
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN = { email: process.env.ADMIN_EMAIL ?? "admin@campus.test", password: process.env.ADMIN_PASSWORD ?? "ChangeMe123!" };
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const run = Math.random().toString(36).slice(2, 8);

class Session {
  cookie = "";
  async call(method, path, body, headers = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body && !isForm ? { "Content-Type": "application/json" } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      redirect: "manual",
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) { const pair = c.split(";")[0]; if (pair.startsWith("quiz_session=")) this.cookie = pair; }
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  get(p) { return this.call("GET", p); }
  post(p, b) { return this.call("POST", p, b ?? {}); }
  put(p, b) { return this.call("PUT", p, b); }
  patch(p, b) { return this.call("PATCH", p, b); }
  del(p) { return this.call("DELETE", p); }
}

const admin = new Session();
const alice = new Session();
const bob = new Session();
let subject, attemptId, answerKey;

function bank(prefix, n) {
  return {
    subject: { name: `Test subject ${prefix}`, code: `T-${prefix}` },
    questions: Array.from({ length: n }, (_, i) => ({
      external_id: `${prefix}-${i + 1}`,
      text: `Sample question number ${i + 1}?`,
      type: i % 5 === 4 ? "multiple_choice" : "single_choice",
      options: [
        { label: "A", text: `Option A of ${i + 1}` },
        { label: "B", text: `Option B of ${i + 1}` },
        { label: "C", text: `Option C of ${i + 1}` },
        { label: "D", text: `Option D of ${i + 1}` },
      ],
      correct_answers: i % 5 === 4 ? ["A", "C"] : [["A", "B", "C", "D"][i % 4]],
      explanation: i % 2 ? `Because ${i + 1}.` : null,
      image: null,
    })),
  };
}
async function importBank(data) {
  const r = await admin.post("/api/admin/import", { data, mode: "skip", commit: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
async function keyFor(id) {
  const { rows } = await db.query(
    `SELECT aq.id AS q, aq.position, array_agg(k.attempt_option_id) AS correct
       FROM attempt_questions aq JOIN attempt_correct_options k ON k.attempt_question_id = aq.id
      WHERE aq.attempt_id = $1 GROUP BY aq.id, aq.position ORDER BY aq.position`, [id]);
  return rows;
}
const walkKeys = (v, acc = new Set()) => {
  if (Array.isArray(v)) v.forEach((x) => walkKeys(x, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { acc.add(k); walkKeys(x, acc); }
  return acc;
};

test.before(async () => {
  await db.connect();
  assert.equal((await admin.post("/api/auth/login", ADMIN)).status, 200, "admin login (did you run npm run db:seed?)");
  for (const [s, n] of [[alice, "alice"], [bob, "bob"]]) {
    const r = await s.post("/api/auth/register", { name: n, email: `${n}-${run}@campus.test`, password: "Password123!" });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
});
test.after(async () => { await db.end(); });

test("anonymous and student requests are rejected on protected endpoints", async () => {
  const anon = new Session();
  assert.equal((await anon.get("/api/subjects")).status, 401);
  assert.equal((await anon.get("/api/admin/subjects")).status, 401);
  assert.equal((await alice.get("/api/admin/subjects")).status, 403);
  assert.equal((await alice.post("/api/admin/import", { data: {}, commit: false })).status, 403);
  assert.equal((await alice.get("/api/admin/attempts")).status, 403);
});

test("cross-origin writes are refused", async () => {
  const r = await alice.call("POST", "/api/attempts", { subject_id: "x", question_count: 1 }, { Origin: "http://evil.example" });
  assert.equal(r.status, 403);
});

test("import validation names the affected question and never guesses", async () => {
  const bad = bank("bad", 3);
  bad.questions[0].correct_answers = ["A", "B"];            // single_choice with 2 answers
  bad.questions[1].correct_answers = ["E"];                 // label that does not exist
  bad.questions[2].external_id = bad.questions[0].external_id; // duplicate id
  bad.questions[2].type = "essay";
  const r = await admin.post("/api/admin/import", { data: bad, commit: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, false);
  const msgs = r.data.errors.map((e) => `${e.question_index}:${e.message}`).join("\n");
  assert.match(msgs, /1:.*exactly one correct answer/);
  assert.match(msgs, /2:.*"E" does not match any option label/);
  assert.match(msgs, /3:.*already used by question #1/);
  assert.match(msgs, /3:.*single_choice/);
  const commit = await admin.post("/api/admin/import", { data: bad, commit: true });
  assert.equal(commit.status, 422);
});

test("import: preview, commit, and duplicate protection", async () => {
  const code = `n${run}`;
  const data = bank(code, 50);
  const p = await admin.post("/api/admin/import", { data, commit: false });
  assert.equal(p.data.ok, true, JSON.stringify(p.data.errors));
  assert.equal(p.data.counts.create, 50);
  assert.equal(p.data.subject.status, "new");
  const first = await importBank(data);
  assert.equal(first.created, 50);
  const again = await importBank(data);
  assert.deepEqual([again.created, again.skipped], [0, 50]);
  const list = (await admin.get("/api/admin/subjects")).data.subjects;
  subject = list.find((s) => s.code === `T-${code}`);
  assert.equal(subject.available_questions, 50);
  // wording is stored exactly as supplied
  const q = (await admin.get(`/api/admin/questions?subject_id=${subject.id}&q=number 7?`)).data.rows[0];
  assert.equal(q.text, "Sample question number 7?");
});

test("asking for more questions than exist is refused with the available count", async () => {
  const r = await alice.post("/api/attempts", { subject_id: subject.id, question_count: 80 });
  assert.equal(r.status, 422);
  assert.equal(r.data.error.code, "not_enough_questions");
  assert.equal(r.data.error.available, 50);
});

test("an attempt freezes N random questions and never exposes the answer key", async () => {
  const r = await alice.post("/api/attempts", { subject_id: subject.id, question_count: 50 });
  assert.equal(r.status, 201);
  attemptId = r.data.attempt_id;
  const view = (await alice.get(`/api/attempts/${attemptId}`)).data;
  assert.equal(view.kind, "taking");
  assert.equal(view.questions.length, 50);
  assert.equal(new Set(view.questions.map((q) => q.id)).size, 50);
  const keys = [...walkKeys(view)];
  for (const k of keys) assert.doesNotMatch(k, /correct|key|explanation|right/i, `leaked field ${k}`);
  assert.deepEqual(Object.keys(view.questions[0].options[0]).sort(), ["html", "id"]);
  // refresh / second load returns the same questions in the same order
  const again = (await alice.get(`/api/attempts/${attemptId}`)).data;
  assert.deepEqual(again.questions.map((q) => q.id), view.questions.map((q) => q.id));
  // the question set is random per attempt
  const other = (await bob.post("/api/attempts", { subject_id: subject.id, question_count: 50 })).data.attempt_id;
  const o = (await bob.get(`/api/attempts/${other}`)).data;
  assert.notDeepEqual(o.questions.map((q) => q.position), []);
  const sig = (v) => v.questions.map((q) => q.html).join("|");
  assert.notEqual(sig(o), sig(view), "two attempts should not have the same order");
});

test("another student cannot read or change someone else's attempt", async () => {
  const q = (await alice.get(`/api/attempts/${attemptId}`)).data.questions[0];
  assert.equal((await bob.get(`/api/attempts/${attemptId}`)).status, 404);
  assert.equal((await bob.put(`/api/attempts/${attemptId}/questions/${q.id}/answer`, { selected: [q.options[0].id] })).status, 404);
  assert.equal((await bob.post(`/api/attempts/${attemptId}/submit`, {})).status, 404);
  assert.equal((await bob.get("/api/attempts")).data.attempts.some((a) => a.id === attemptId), false);
});

test("input is validated: foreign options and too many options are rejected", async () => {
  const view = (await alice.get(`/api/attempts/${attemptId}`)).data;
  const [q2] = view.questions.slice(1);
  const q1 = view.questions.find((q) => q.type === "single_choice" && q.id !== q2.id);
  assert.equal((await alice.put(`/api/attempts/${attemptId}/questions/${q1.id}/answer`, { selected: [q2.options[0].id] })).status, 422);
  assert.equal((await alice.put(`/api/attempts/${attemptId}/questions/${q1.id}/answer`, { selected: q1.options.slice(0, 2).map((o) => o.id) })).status, 422);
  assert.equal((await alice.put(`/api/attempts/${attemptId}/questions/${q1.id}/answer`, { selected: ["nope"] })).status, 422);
});

test("autosave + submit grades on the server: 37 of 50 correct = 74%", async () => {
  answerKey = await keyFor(attemptId);
  assert.equal(answerKey.length, 50);
  const view = (await alice.get(`/api/attempts/${attemptId}`)).data;
  const byId = new Map(view.questions.map((q) => [q.id, q]));
  const answers = {};
  answerKey.forEach((row, i) => {
    const q = byId.get(row.q);
    if (i < 37) answers[row.q] = row.correct;                                   // right answer(s)
    else answers[row.q] = [q.options.find((o) => !row.correct.includes(o.id)).id]; // a wrong option
  });
  // save the first 20 through the autosave endpoint, flag one, send the rest with the submit call
  const entries = Object.entries(answers);
  for (const [qid, sel] of entries.slice(0, 20)) {
    assert.equal((await alice.put(`/api/attempts/${attemptId}/questions/${qid}/answer`, { selected: sel })).status, 200);
  }
  assert.equal((await alice.put(`/api/attempts/${attemptId}/questions/${entries[0][0]}/flag`, { flagged: true })).status, 200);
  const reload = (await alice.get(`/api/attempts/${attemptId}`)).data;
  assert.equal(reload.questions.filter((q) => q.selected.length).length, 20);
  assert.equal(reload.questions.filter((q) => q.flagged).length, 1);

  const rest = Object.fromEntries(entries.slice(20));
  const [a, b] = await Promise.all([alice.post(`/api/attempts/${attemptId}/submit`, { answers: rest }), alice.post(`/api/attempts/${attemptId}/submit`, { answers: rest })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  for (const r of [a, b]) {
    assert.equal(r.data.correct_count, 37);
    assert.equal(r.data.total_questions, 50);
    assert.equal(r.data.score_percent, 74);
  }
  assert.equal([a, b].filter((r) => r.data.already_finished).length, 1, "exactly one of the concurrent submits does the grading");
  const { rows } = await db.query("SELECT status, correct_count, total_questions, score_percent::float AS pct FROM attempts WHERE id = $1", [attemptId]);
  assert.deepEqual(rows[0], { status: "finished", correct_count: 37, total_questions: 50, pct: 74 });
  const again = await alice.post(`/api/attempts/${attemptId}/submit`, {});
  assert.equal(again.data.already_finished, true);
  assert.equal(again.data.score_percent, 74);
});

test("a finished attempt is locked and its review follows the policy", async () => {
  const q = (await alice.get(`/api/attempts/${attemptId}`)).data;
  assert.equal(q.kind, "review");
  assert.equal(q.questions.filter((x) => x.is_correct).length, 37);
  assert.ok(q.questions.every((x) => Array.isArray(x.right_answer_html)));
  const first = q.questions[0];
  assert.equal((await alice.put(`/api/attempts/${attemptId}/questions/${first.id}/answer`, { selected: [] })).status, 409);
  assert.equal((await alice.put(`/api/attempts/${attemptId}/questions/${first.id}/flag`, { flagged: false })).status, 409);
  const history = (await alice.get("/api/attempts")).data.attempts.find((a) => a.id === attemptId);
  assert.equal(history.score_percent, 74);
});

test("retaking creates a new attempt and keeps the old one", async () => {
  const r = await alice.post("/api/attempts", { subject_id: subject.id, question_count: 10 });
  assert.equal(r.status, 201);
  assert.notEqual(r.data.attempt_id, attemptId);
  const list = (await alice.get("/api/attempts")).data.attempts.filter((a) => a.subject_id === subject.id);
  assert.equal(list.length, 2);
  assert.equal(list.find((a) => a.id === attemptId).score_percent, 74);
});

test("the server enforces the time limit", async () => {
  await admin.patch(`/api/admin/subjects/${subject.id}`, { name: subject.name, code: subject.code, description: null, time_per_question_seconds: 30, review_policy: "full", questions_per_page: 1, shuffle_options: false });
  const id = (await alice.post("/api/attempts", { subject_id: subject.id, question_count: 5 })).data.attempt_id;
  const view = (await alice.get(`/api/attempts/${id}`)).data;
  assert.equal(view.attempt.time_limit_seconds, 150);
  assert.ok(view.attempt.seconds_left > 140 && view.attempt.seconds_left <= 150);
  const key = await keyFor(id);
  assert.equal((await alice.put(`/api/attempts/${id}/questions/${key[0].q}/answer`, { selected: key[0].correct })).status, 200);
  await db.query("UPDATE attempts SET started_at = started_at - interval '1 hour', deadline_at = now() - interval '1 minute' WHERE id = $1", [id]);
  const late = await alice.put(`/api/attempts/${id}/questions/${key[1].q}/answer`, { selected: key[1].correct });
  assert.equal(late.status, 409);
  assert.equal(late.data.error.code, "time_expired");
  const done = (await alice.get(`/api/attempts/${id}`)).data;
  assert.equal(done.kind, "review");
  assert.equal(done.attempt.finish_reason, "time_expired");
  assert.equal(done.attempt.correct_count, 1, "only the answer saved before the deadline counts");
  const lateSubmit = await alice.post(`/api/attempts/${id}/submit`, { answers: { [key[1].q]: key[1].correct } });
  assert.equal(lateSubmit.data.correct_count, 1);
});

test("review policy score_only hides the review; shuffled options still grade correctly", async () => {
  const code = `s${run}`;
  await importBank(bank(code, 6));
  const sub = (await admin.get("/api/admin/subjects")).data.subjects.find((s) => s.code === `T-${code}`);
  await admin.patch(`/api/admin/subjects/${sub.id}`, { name: sub.name, code: sub.code, description: null, time_per_question_seconds: null, review_policy: "score_only", questions_per_page: 3, shuffle_options: true });
  const id = (await alice.post("/api/attempts", { subject_id: sub.id, question_count: 6 })).data.attempt_id;
  const key = await keyFor(id);
  const answers = Object.fromEntries(key.map((k) => [k.q, k.correct]));
  const r = await alice.post(`/api/attempts/${id}/submit`, { answers });
  assert.equal(r.data.score_percent, 100);
  const review = (await alice.get(`/api/attempts/${id}`)).data;
  assert.equal(review.review_available, false);
  assert.equal(review.questions.length, 0);
  assert.equal(review.attempt.questions_per_page, 3);
  const adminView = (await admin.get(`/api/admin/attempts/${id}`)).data;
  assert.equal(adminView.questions.length, 6, "admins always see the full attempt");
  const { rows } = await db.query("SELECT count(DISTINCT position)::int AS n FROM attempt_options WHERE attempt_question_id = $1", [key[0].q]);
  assert.equal(rows[0].n, 4);
});

test("editing a question does not change past attempts; images can be attached and removed", async () => {
  const list = (await admin.get(`/api/admin/questions?subject_id=${subject.id}&q=number 7?`)).data.rows;
  const detail = (await admin.get(`/api/admin/questions/${list[0].id}`)).data.question;
  const patch = await admin.patch(`/api/admin/questions/${detail.id}`, {
    external_id: detail.external_id, type: detail.type, text: "EDITED wording", explanation: null,
    options: detail.options.map((o) => ({ label: o.label, text: o.text })),
    correct_answers: detail.options.filter((o) => o.correct).map((o) => o.label), active: true,
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.data));
  const review = (await alice.get(`/api/attempts/${attemptId}`)).data;
  assert.ok(review.questions.some((q) => q.html.includes("number 7?")), "old attempt still shows the original wording");
  assert.ok(!review.questions.some((q) => q.html.includes("EDITED")));

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const form = new FormData(); form.set("file", new Blob([png], { type: "image/png" }), "q.png");
  const up = await admin.post(`/api/admin/questions/${detail.id}/image`, form);
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const src = up.data.question.image_src;
  assert.match(src, /^\/api\/images\/[0-9a-f-]+\.png$/);
  const img = await alice.get(src);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");
  assert.equal((await new Session().get(src)).status, 401);
  const bad = new FormData(); bad.set("file", new Blob(["<svg onload=alert(1)>"], { type: "image/svg+xml" }), "x.svg");
  assert.equal((await admin.post(`/api/admin/questions/${detail.id}/image`, bad)).status, 422);
  const removed = await admin.del(`/api/admin/questions/${detail.id}/image`);
  assert.equal(removed.data.question.image_src, null);
  assert.equal((await alice.get(src)).status, 404);
});

test("subject banners: upload, serve to students, replace, remove", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const form = () => { const f = new FormData(); f.set("file", new Blob([png], { type: "image/png" }), "banner.png"); return f; };
  const url = `/api/admin/subjects/${subject.id}/banner`;
  assert.equal((await alice.post(url, form())).status, 403, "students cannot upload banners");
  const up = await admin.post(url, form());
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const first = up.data.subject.banner_src;
  assert.match(first, /^\/api\/images\/[0-9a-f-]+\.png$/);
  const mine = (await alice.get("/api/subjects")).data.subjects.find((s) => s.id === subject.id);
  assert.equal(mine.banner_src, first, "students see the banner in their subject list");
  assert.equal((await alice.get(first)).status, 200);
  assert.equal((await new Session().get(first)).status, 401, "banners are behind the login");
  const second = (await admin.post(url, form())).data.subject.banner_src;
  assert.notEqual(second, first);
  assert.equal((await alice.get(first)).status, 404, "the replaced file is deleted");
  assert.equal((await alice.get(second)).status, 200);
  const bad = new FormData(); bad.set("file", new Blob(["<svg onload=alert(1)></svg>"], { type: "image/svg+xml" }), "x.svg");
  assert.equal((await admin.post(url, bad)).status, 422);
  const removed = await admin.del(url);
  assert.equal(removed.data.subject.banner_src, null);
  assert.equal((await alice.get(second)).status, 404);
});

test("health check works without logging in", async () => {
  const r = await new Session().get("/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
});

test("deleting a subject keeps students' attempt history", async () => {
  const r = await admin.del(`/api/admin/subjects/${subject.id}`);
  assert.equal(r.status, 200);
  const h = (await alice.get("/api/attempts")).data.attempts.find((a) => a.id === attemptId);
  assert.equal(h.score_percent, 74);
  assert.equal(h.subject_id, null);
  assert.equal((await alice.get(`/api/attempts/${attemptId}`)).data.kind, "review");
});
