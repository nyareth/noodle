import assert from "node:assert/strict";
import test from "node:test";
import { exactSet, isQuestionCorrect, scorePercent } from "../../src/lib/grading";

test("37 of 50 is 74%", () => {
  assert.equal(scorePercent(37, 50), 74);
  assert.equal(scorePercent(50, 50), 100);
  assert.equal(scorePercent(0, 50), 0);
});

test("percentages keep two decimals and never divide by zero", () => {
  assert.equal(scorePercent(1, 3), 33.33);
  assert.equal(scorePercent(2, 3), 66.67);
  assert.equal(scorePercent(0, 0), 0);
});

test("exact-set grading: all correct options and nothing else", () => {
  assert.equal(isQuestionCorrect("single_choice", ["a"], ["a"]), true);
  assert.equal(isQuestionCorrect("single_choice", ["b"], ["a"]), false);
  assert.equal(isQuestionCorrect("single_choice", [], ["a"]), false);
  assert.equal(isQuestionCorrect("multiple_choice", ["a", "c"], ["c", "a"]), true);
  assert.equal(isQuestionCorrect("multiple_choice", ["a"], ["a", "c"]), false, "missing a correct option");
  assert.equal(isQuestionCorrect("multiple_choice", ["a", "b", "c"], ["a", "c"]), false, "an extra wrong option");
  assert.equal(exactSet(new Set(), new Set()), true);
});
