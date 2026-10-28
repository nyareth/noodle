import { env } from "../env";
import { ApiError } from "../errors";
import { queryOne } from "../db";
import { getStorage, sniffImage } from "../storage";

/** URL the browser uses for a stored image (served through the app, behind the login) or an external URL. */
export const imageSrc = (key: string | null, url: string | null) => (key ? `/api/images/${key}` : url);

/** Validates an uploaded image (size, real file type) and stores it. Returns the storage key. */
export async function storeImage(bytes: Buffer): Promise<string> {
  if (bytes.length === 0) throw new ApiError(422, "empty_file", "The uploaded file is empty.");
  if (bytes.length > env.maxImageBytes) {
    throw new ApiError(413, "image_too_large", `Images can be at most ${Math.round(env.maxImageBytes / 1024 / 1024)} MB.`);
  }
  const mime = sniffImage(bytes);
  if (!mime) throw new ApiError(422, "unsupported_image", "Upload a PNG, JPEG, GIF or WebP image.");
  try {
    return await getStorage().put(bytes, mime);
  } catch (e) {
    console.error("Image storage failed:", e);
    throw new ApiError(502, "storage_error", "The image could not be saved to storage. Check the storage settings (UploadThing token) and try again.");
  }
}

/** Removes a stored file only when nothing (a question, a banner or a past attempt) still points at it. */
export async function gcImage(key: string | null | undefined) {
  if (!key) return;
  const used = await queryOne(
    `SELECT 1 FROM questions WHERE image_key = $1
     UNION ALL SELECT 1 FROM attempt_questions WHERE image_key = $1
     UNION ALL SELECT 1 FROM subjects WHERE banner_key = $1 LIMIT 1`,
    [key],
  );
  if (!used) await getStorage().remove(key).catch((e) => console.error("Could not delete stored image", key, e));
}

/** Best-effort removal of a file we just stored but could not attach (e.g. the database write failed). */
export const discardImage = (key: string) => getStorage().remove(key).catch(() => undefined);
