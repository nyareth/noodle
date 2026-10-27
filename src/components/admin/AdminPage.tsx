import { MoodleShell, type Crumb } from "../MoodleShell";
import { requirePageAdmin } from "@/lib/auth";

/** Every admin page: checks the role on the server, then draws the Moodle frame with the admin tabs. */
export async function AdminPage({ title, crumbs = [], actions, children }: {
  title: string;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  children: (user: Awaited<ReturnType<typeof requirePageAdmin>>) => React.ReactNode | Promise<React.ReactNode>;
}) {
  const user = await requirePageAdmin();
  const body = await children(user);
  return (
    <MoodleShell user={user} title={title} crumbs={[{ label: "Administration", href: "/admin" }, ...crumbs]} adminTabs actions={actions}>
      {body}
    </MoodleShell>
  );
}
