import { requireUser } from "@/lib/auth";
import { notFound, route } from "@/lib/http";
import { submitAttempt, submitInput } from "@/lib/services/attempts";
import { isUuid } from "@/lib/util";

type Ctx = { params: Promise<{ id: string }> };

/** Idempotent: submitting an already-finished attempt returns the stored result. */
export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) throw notFound("Attempt");
  const body = submitInput.parse(await req.json().catch(() => ({})));
  return submitAttempt(user.id, id, body);
});
