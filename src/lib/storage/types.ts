export interface StoredObject { body: Buffer; contentType: string }

export interface Storage {
  /** Stores an image and returns the key to keep in the database (the driver chooses the key). */
  put(bytes: Buffer, mime: ImageMime): Promise<string>;
  get(key: string): Promise<StoredObject | null>;
  remove(key: string): Promise<void>;
}

export const IMAGE_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as const;
export type ImageMime = keyof typeof IMAGE_EXT;
export const EXT_MIME: Record<string, ImageMime> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** Keys written by the local driver: <uuid>.<ext>. */
export const isLocalKey = (k: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/.test(k);

/** Any key we are willing to look up (local keys and UploadThing file keys). Blocks path tricks. */
export const isSafeKey = (k: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{5,199}$/.test(k);

export const mimeFromKey = (k: string): ImageMime => EXT_MIME[k.split(".").pop() ?? ""] ?? "image/png";

/** Identify an image by its magic bytes (never trust a client's Content-Type). SVG is intentionally not allowed. */
export function sniffImage(b: Buffer): ImageMime | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a")) return "image/gif";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}
