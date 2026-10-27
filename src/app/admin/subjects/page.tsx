import SubjectsAdmin from "@/components/admin/SubjectsAdmin";
import { AdminPage } from "@/components/admin/AdminPage";
import { listSubjects } from "@/lib/services/subjects";

export default async function AdminSubjectsPage() {
  return (
    <AdminPage title="Subjects" crumbs={[{ label: "Subjects" }]}>
      {async () => <SubjectsAdmin subjects={await listSubjects()} />}
    </AdminPage>
  );
}
