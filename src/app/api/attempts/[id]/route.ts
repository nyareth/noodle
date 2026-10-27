import { requireUser } from "@/lib/auth";
import { notFound, route } from "@/lib/http";
import { getReviewPayload, getTakingPayload } from "@/lib/services/attempts";

type Ctx = { params: Promise<{ id: string }> };

/** In progress: questions + saved answers (no answer key). Finished: the review allowed by the review policy. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  const taking = await getTakingPayload(user.id, id);
  if (taking.state === "missing") throw notFound("Attempt");
  if (taking.state === "taking") return { kind: "taking", ...taking.payload };
  const review = await getReviewPayload(id, { userId: user.id });
  if (review.state !== "ok") throw notFound("Attempt");
  return { kind: "review", ...review.payload };
});
