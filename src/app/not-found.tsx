import Link from "next/link";
import { MoodleShell } from "@/components/MoodleShell";
import { getCurrentUser } from "@/lib/auth";

export default async function NotFound() {
  const user = await getCurrentUser();
  return (
    <MoodleShell user={user} title="Page not found">
      <p>The page you asked for does not exist, or you do not have access to it.</p>
      <Link className="btn btn-primary" href="/">Back to the home page</Link>
    </MoodleShell>
  );
}
