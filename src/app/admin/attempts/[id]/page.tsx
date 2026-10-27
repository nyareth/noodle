import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/AdminPage";
import { MoodleShell } from "@/components/MoodleShell";
import { ReviewView } from "@/components/quiz/ReviewView";
import { Alert } from "@/components/ui";
import { requirePageAdmin } from "@/lib/auth";
import { first, toInt } from "@/lib/page-utils";
import { getReviewPayload } from "@/lib/services/attempts";

export default async function AdminAttemptPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const res = await getReviewPayload(id, { admin: true });
  if (res.state === "missing") {
    await requirePageAdmin();
    notFound();
  }
  if (res.state === "in_progress") {
    return (
      <AdminPage title="Attempt" crumbs={[{ label: "Attempts", href: "/admin/attempts" }, { label: "Attempt" }]}>
        {() => <Alert kind="info">This attempt is still in progress, so there is nothing to review yet.</Alert>}
      </AdminPage>
    );
  }
  const user = await requirePageAdmin();
  const a = res.payload.attempt;
  return (
    <MoodleShell
      user={user}
      title={a.subject_name}
      crumbs={[{ label: "Administration", href: "/admin" }, { label: "Attempts", href: "/admin/attempts" }, { label: res.payload.student?.name ?? "Attempt" }]}
      raw
      drawer={res.payload.review_available}
    >
      <ReviewView
        payload={res.payload}
        page={toInt(sp.page, 1)}
        showAll={first(sp.showall) === "1"}
        basePath={`/admin/attempts/${id}`}
        finishHref="/admin/attempts"
        finishLabel="Back to attempts"
      />
    </MoodleShell>
  );
}
