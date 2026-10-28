import assert from "node:assert/strict";
import test from "node:test";
import { validateImport } from "../../src/lib/import-validation";

const q = (over: Record<string, unknown> = {}) => ({
  external_id: "q1",
  text: "Which?",
  type: "single_choice",
  options: [{ label: "A", text: "One" }, { label: "B", text: "Two" }],
  correct_answers: ["A"],
  explanation: null,
  image: null,
  ...over,
});
const file = (...questions: unknown[]) => ({ subject: { name: "Subject", code: "S1" }, questions });

test("wording, option order and the answer key are kept exactly as supplied", () => {
  const text = "  Leading spaces\nsecond line  ";
  const r = validateImport(file(q({ text, options: [{ label: "B", text: " Two " }, { label: "A", text: "One" }], correct_answers: ["A"] })));
  assert.deepEqual(r.errors, []);
  assert.equal(r.questions[0]!.text, text);
  assert.deepEqual(r.questions[0]!.options.map((o) => [o.label, o.text]), [["B", " Two "], ["A", "One"]]);
  assert.deepEqual(r.questions[0]!.correct_labels, ["A"]);
});

test("nothing is guessed: wrong-case labels, extra answers and duplicates are errors that name the question", () => {
  const r = validateImport(file(
    q({ external_id: "a", correct_answers: ["a"] }),
    q({ external_id: "b", correct_answers: ["A", "B"] }),
    q({ external_id: "a" }),
    q({ external_id: "c", type: "essay" }),
  ));
  const msgs = r.errors.map((e) => `${e.question_index}:${e.message}`).join("\n");
  assert.match(msgs, /1:.*"a" does not match any option label/);
  assert.match(msgs, /2:.*exactly one correct answer/);
  assert.match(msgs, /3:.*already used by question #1/);
  assert.match(msgs, /4:.*"single_choice" or "multiple_choice"/);
  assert.equal(r.questions.length, 0);
});

test("images must be null or an http(s) URL; unknown fields only warn", () => {
  assert.equal(validateImport(file(q({ image: "photo.png" }))).errors.length, 1);
  const ok = validateImport(file(q({ image: "https://example.com/a.png", mystery: 1 })));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.questions[0]!.image_url, "https://example.com/a.png");
  assert.equal(ok.warnings.length, 1);
});
