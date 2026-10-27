import { requireAdmin } from "@/lib/auth";
import { readJson, route } from "@/lib/http";
import { deleteSubject, subjectInput, updateSubject } from "@/lib/services/subjects";

type Ctx = { params: Promise<{ id: string }> };

/** Full replacement of the subject's settings (the form always sends every field). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const input = await readJson(req, subjectInput, 50_000);
  return { subject: await updateSubject(id, input) };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  return deleteSubject(id);
});
