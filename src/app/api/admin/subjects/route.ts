import { requireAdmin } from "@/lib/auth";
import { json, readJson, route } from "@/lib/http";
import { createSubject, listSubjects, subjectInput } from "@/lib/services/subjects";

export const GET = route(async () => {
  await requireAdmin();
  return { subjects: await listSubjects() };
});

export const POST = route(async (req) => {
  await requireAdmin();
  const input = await readJson(req, subjectInput, 50_000);
  return json({ subject: await createSubject(input) }, { status: 201 });
});
