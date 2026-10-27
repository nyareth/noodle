import { requireUser } from "@/lib/auth";
import { json, readJson, route } from "@/lib/http";
import { listAttemptsForUser, startAttempt, startAttemptInput } from "@/lib/services/attempts";

export const GET = route(async () => {
  const user = await requireUser();
  return { attempts: await listAttemptsForUser(user.id) };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { subject_id, question_count } = await readJson(req, startAttemptInput, 10_000);
  const started = await startAttempt(user.id, subject_id, question_count);
  return json({ ...started, url: `/attempts/${started.attempt_id}` }, { status: 201 });
});
