import { requireAdmin } from "@/lib/auth";
import { route } from "@/lib/http";
import { listQuestions } from "@/lib/services/questions";

export const GET = route(async (req) => {
  await requireAdmin();
  const p = req.nextUrl.searchParams;
  const page = Math.max(1, Number(p.get("page")) || 1);
  const perPage = Math.min(100, Math.max(1, Number(p.get("per_page")) || 25));
  const active = p.get("active");
  return listQuestions({
    subjectId: p.get("subject_id") || undefined,
    search: p.get("q")?.trim() || undefined,
    active: active === "true" ? true : active === "false" ? false : undefined,
    page,
    perPage,
  }).then((r) => ({ ...r, page, per_page: perPage }));
});
