import { requireUser } from "@/lib/auth";
import { notFound, readJson, route } from "@/lib/http";
import { answerInput, saveAnswer } from "@/lib/services/attempts";
import { isUuid } from "@/lib/util";

type Ctx = { params: Promise<{ id: string; qid: string }> };

export const PUT = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id, qid } = await params;
  if (!isUuid(id) || !isUuid(qid)) throw notFound("Question");
  const { selected } = await readJson(req, answerInput, 20_000);
  await saveAnswer(user.id, id, qid, selected);
  return { saved: true };
});
