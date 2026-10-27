import { requireUser } from "@/lib/auth";
import { notFound, readJson, route } from "@/lib/http";
import { flagInput, setFlag } from "@/lib/services/attempts";
import { isUuid } from "@/lib/util";

type Ctx = { params: Promise<{ id: string; qid: string }> };

export const PUT = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id, qid } = await params;
  if (!isUuid(id) || !isUuid(qid)) throw notFound("Question");
  const { flagged } = await readJson(req, flagInput, 2_000);
  await setFlag(user.id, id, qid, flagged);
  return { flagged };
});
