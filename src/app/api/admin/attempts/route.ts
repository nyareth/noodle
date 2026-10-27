import { requireAdmin } from "@/lib/auth";
import { route } from "@/lib/http";
import { listAttemptsAdmin } from "@/lib/services/attempts";

export const GET = route(async (req) => {
  await requireAdmin();
  const p = req.nextUrl.searchParams;
  const page = Math.max(1, Number(p.get("page")) || 1);
  const perPage = Math.min(100, Math.max(1, Number(p.get("per_page")) || 25));
  const r = await listAttemptsAdmin({
    subjectId: p.get("subject_id") || undefined,
    userId: p.get("user_id") || undefined,
    status: p.get("status") || undefined,
    page,
    perPage,
  });
  return { ...r, page, per_page: perPage };
});
