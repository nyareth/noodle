import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { notFound, route } from "@/lib/http";
import { getStorage, isSafeKey, sniffImage } from "@/lib/storage";

type Ctx = { params: Promise<{ key: string }> };

/** Question images and subject banners are served through the app, so they are only visible to signed-in users. */
export const GET = route<Ctx>(async (_req, { params }) => {
  await requireUser();
  const { key } = await params;
  if (!isSafeKey(key)) throw notFound("Image");
  let obj;
  try {
    obj = await getStorage().get(key);
  } catch (e) {
    console.error("Image storage read failed:", key, e);
    throw new ApiError(502, "storage_error", "The image could not be loaded from storage.");
  }
  if (!obj) throw notFound("Image");
  const mime = sniffImage(obj.body); // only ever serve real images from our origin
  if (!mime) throw notFound("Image");
  return new Response(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(obj.body.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
