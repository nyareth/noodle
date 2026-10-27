import { requireAdmin } from "@/lib/auth";
import { notFound, route } from "@/lib/http";
import { getReviewPayload } from "@/lib/services/attempts";

type Ctx = { params: Promise<{ id: string }> };

/** Full review of any finished attempt (answer key included) - admin only. */
export const GET = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const r = await getReviewPayload((await params).id, { admin: true });
  if (r.state === "missing") throw notFound("Attempt");
  if (r.state === "in_progress") return { kind: "in_progress" };
  return { kind: "review", ...r.payload };
});
