import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin/AdminPage";
import QuestionEditor from "@/components/admin/QuestionEditor";
import { getQuestionDetail } from "@/lib/services/questions";

export default async function AdminQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminPage title="Edit question" crumbs={[{ label: "Questions", href: "/admin/questions" }, { label: "Edit" }]}>
      {async () => {
        const q = await getQuestionDetail(id);
        if (!q) notFound();
        return <QuestionEditor question={q} />;
      }}
    </AdminPage>
  );
}
