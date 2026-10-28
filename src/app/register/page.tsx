import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/AuthForms";
import { MoodleShell } from "@/components/MoodleShell";
import { Alert } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "New account" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <MoodleShell user={null} title="New account" bare>
      {env.allowRegistration ? (
        <RegisterForm domains={env.allowedEmailDomains} siteName={env.siteName} />
      ) : (
        <div className="login-wrap">
          <Alert kind="info">
            Self-registration is turned off. Ask an administrator to create your account, then <Link href="/login">log in</Link>.
          </Alert>
        </div>
      )}
    </MoodleShell>
  );
}
