import { queryOne } from "../db";

export interface AdminStats {
  students: number;
  subjects: number;
  questions: number;
  attempts: number;
  finished: number;
  avg_score: number | null;
}

export const getAdminStats = () =>
  queryOne<AdminStats>(
    `SELECT (SELECT count(*) FROM users WHERE role = 'student' AND active) AS students,
            (SELECT count(*) FROM subjects) AS subjects,
            (SELECT count(*) FROM questions) AS questions,
            (SELECT count(*) FROM attempts) AS attempts,
            (SELECT count(*) FROM attempts WHERE status = 'finished') AS finished,
            (SELECT avg(score_percent) FROM attempts WHERE status = 'finished') AS avg_score`,
  ).then((r) => r!);
