import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShellLogin } from "./shell";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { first } from "@/lib/page-utils";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  return <AuthShellLogin next={first(sp.next)} canRegister={env.allowRegistration} />;
}
