import { requireAdmin } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { route } from "@/lib/http";
import { removeQuestionImage, setQuestionImage } from "@/lib/services/questions";

type Ctx = { params: Promise<{ id: string }> };

/** multipart/form-data with a "file" field (and optional "alt"). Attaches or replaces the image. */
export const POST = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new ApiError(422, "no_file", 'Send the image in a multipart field named "file".');
  const alt = form?.get("alt");
  return { question: await setQuestionImage(id, Buffer.from(await file.arrayBuffer()), typeof alt === "string" && alt.trim() ? alt.trim() : null) };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  return { question: await removeQuestionImage((await params).id) };
});
