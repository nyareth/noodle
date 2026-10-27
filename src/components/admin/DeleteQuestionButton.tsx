"use client";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export default function DeleteQuestionButton({ id, redirectTo }: { id: string; redirectTo?: string }) {
  const router = useRouter();
  async function del() {
    if (!window.confirm("Delete this question? Past attempts keep their own copy of it.")) return;
    try {
      await api(`/api/admin/questions/${id}`, { method: "DELETE" });
      if (redirectTo) router.push(redirectTo); else router.refresh();
    } catch (e) { window.alert(e instanceof Error ? e.message : "Could not delete."); }
  }
  return <button className="btn btn-sm btn-danger" onClick={del}>Delete</button>;
}
