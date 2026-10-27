import { notFound, redirect } from "next/navigation";
import { MoodleShell } from "@/components/MoodleShell";
import { ReviewView } from "@/components/quiz/ReviewView";
import { requirePageUser } from "@/lib/auth";
import { first, toInt } from "@/lib/page-utils";
import { getReviewPayload } from "@/lib/services/attempts";

export default async function ReviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePageUser(`/attempts/${id}/review`);
  const res = await getReviewPayload(id, { userId: user.id });
  if (res.state === "missing") notFound();
  if (res.state === "in_progress") redirect(`/attempts/${id}`);
  const { payload } = res;
  const a = payload.attempt;
  return (
    <MoodleShell
      user={user}
      title={a.subject_name}
      crumbs={[a.subject_id ? { label: a.subject_name, href: `/subjects/${a.subject_id}` } : { label: a.subject_name }, { label: "Review" }]}
      raw
      drawer={payload.review_available}
    >
      <ReviewView
        payload={payload}
        page={toInt(sp.page, 1)}
        showAll={first(sp.showall) === "1"}
        basePath={`/attempts/${id}/review`}
        finishHref={a.subject_id ? `/subjects/${a.subject_id}` : "/attempts"}
        finishLabel="Finish review"
      />
    </MoodleShell>
  );
}
