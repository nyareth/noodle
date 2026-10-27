import { requireAdmin } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { notFound, route } from "@/lib/http";
import { validateQuestionObject, type ImportIssue } from "@/lib/import-validation";
import { deleteQuestion, getQuestionDetail, updateQuestion } from "@/lib/services/questions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const q = await getQuestionDetail((await params).id);
  if (!q) throw notFound("Question");
  return { question: q };
});

/** Same shape as an import entry (external_id, text, type, options, correct_answers, explanation) plus active / image_alt. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const raw = await req.json().catch(() => null);
  const sink: { errors: ImportIssue[]; warnings: ImportIssue[] } = { errors: [], warnings: [] };
  const parsed = validateQuestionObject(raw, 1, sink);
  if (!parsed) {
    throw new ApiError(422, "invalid_question", sink.errors[0]?.message ?? "The question is not valid.", { errors: sink.errors });
  }
  const { index: _index, ...content } = parsed;
  void _index;
  const active = typeof raw.active === "boolean" ? raw.active : undefined;
  return { question: await updateQuestion(id, { ...content, image_url: null }, active) };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  await deleteQuestion((await params).id);
  return { deleted: true };
});
