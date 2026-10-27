import { AdminPage } from "@/components/admin/AdminPage";
import UsersAdmin from "@/components/admin/UsersAdmin";
import { listUsers } from "@/lib/services/users";

export default async function AdminUsersPage() {
  return (
    <AdminPage title="Users" crumbs={[{ label: "Users" }]}>
      {async (me) => <UsersAdmin users={JSON.parse(JSON.stringify(await listUsers()))} meId={me.id} />}
    </AdminPage>
  );
}
