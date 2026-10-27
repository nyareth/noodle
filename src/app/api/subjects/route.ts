import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { listSubjectsForStudent } from "@/lib/services/subjects";

export const GET = route(async () => {
  const user = await requireUser();
  return { subjects: await listSubjectsForStudent(user.id) };
});
