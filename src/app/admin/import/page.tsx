import { AdminPage } from "@/components/admin/AdminPage";
import ImportClient from "@/components/admin/ImportClient";

export default async function AdminImportPage() {
  return (
    <AdminPage title="Import questions" crumbs={[{ label: "Import questions" }]}>
      {() => <ImportClient />}
    </AdminPage>
  );
}
