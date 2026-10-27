export type QuestionType = "single_choice" | "multiple_choice";

/**
 * Grading rule for one question. Receives the selected option ids and the correct option ids.
 *
 * Current rule: EXACT SET - every correct option must be selected and no wrong option may be selected.
 * That is also the right rule for single-choice (one correct option). To change grading later (partial
 * credit, negative marking, ...) replace `isQuestionCorrect` and, if you need fractional marks,
 * add a column next to attempt_questions.is_correct.
 */
export function exactSet(selected: ReadonlySet<string>, correct: ReadonlySet<string>): boolean {
  if (selected.size !== correct.size) return false;
  for (const id of selected) if (!correct.has(id)) return false;
  return true;
}

export function isQuestionCorrect(_type: QuestionType, selected: readonly string[], correct: readonly string[]): boolean {
  return exactSet(new Set(selected), new Set(correct));
}

/** 37 of 50 -> 74. Two decimals, computed with integers to avoid float surprises. */
export function scorePercent(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct * 10000) / total) / 100;
}
