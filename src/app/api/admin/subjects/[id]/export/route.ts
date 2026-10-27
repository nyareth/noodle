import { requireAdmin } from "@/lib/auth";
import { route } from "@/lib/http";
import { exportSubjectQuestions } from "@/lib/services/subjects";

type Ctx = { params: Promise<{ id: string }> };

function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Download this subject's questions as the JSON format used by Import. */
export const GET = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  const { filename, body } = await exportSubjectQuestions((await params).id);
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
    },
  });
});
