import { notFound, redirect } from "next/navigation";
import { MoodleShell } from "@/components/MoodleShell";
import AttemptView from "@/components/quiz/AttemptView";
import { requirePageUser } from "@/lib/auth";
import { first, toInt } from "@/lib/page-utils";
import { getTakingPayload } from "@/lib/services/attempts";

export default async function AttemptPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePageUser(`/attempts/${id}`);
  const res = await getTakingPayload(user.id, id);
  if (res.state === "missing") notFound();
  if (res.state === "finished") redirect(`/attempts/${id}/review`);
  const { attempt } = res.payload;
  return (
    <MoodleShell
      user={user}
      title={attempt.subject_name}
      crumbs={[attempt.subject_id ? { label: attempt.subject_name, href: `/subjects/${attempt.subject_id}` } : { label: attempt.subject_name }, { label: "Attempt" }]}
      raw
      drawer
    >
      <AttemptView initial={res.payload} initialPage={toInt(sp.page, 1)} initialView={first(sp.view) === "summary" ? "summary" : "attempt"} />
    </MoodleShell>
  );
}
