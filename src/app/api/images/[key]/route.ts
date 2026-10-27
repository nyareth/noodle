import { requireUser } from "@/lib/auth";
import { notFound, route } from "@/lib/http";
import { getStorage, isValidKey } from "@/lib/storage";

type Ctx = { params: Promise<{ key: string }> };

/** Question images are served through the app so they are only visible to signed-in users. */
export const GET = route<Ctx>(async (_req, { params }) => {
  await requireUser();
  const { key } = await params;
  if (!isValidKey(key)) throw notFound("Image");
  const obj = await getStorage().get(key);
  if (!obj) throw notFound("Image");
  return new Response(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.body.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
