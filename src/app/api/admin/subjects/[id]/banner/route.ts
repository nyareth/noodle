import { requireAdmin } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { route } from "@/lib/http";
import { removeSubjectBanner, setSubjectBanner } from "@/lib/services/subjects";

type Ctx = { params: Promise<{ id: string }> };

/** multipart/form-data with a "file" field. Attaches or replaces the subject's banner image. */
export const POST = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new ApiError(422, "no_file", 'Send the image in a multipart field named "file".');
  return { subject: await setSubjectBanner(id, Buffer.from(await file.arrayBuffer())) };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  return { subject: await removeSubjectBanner((await params).id) };
});
