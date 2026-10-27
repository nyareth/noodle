import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env";

export interface StoredObject { body: Buffer; contentType: string }
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  remove(key: string): Promise<void>;
}

export const IMAGE_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as const;
export type ImageMime = keyof typeof IMAGE_EXT;
const EXT_MIME: Record<string, ImageMime> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** Object keys are server-generated UUIDs; anything else is rejected (no path traversal). */
export const isValidKey = (k: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/.test(k);
const mimeForKey = (k: string): ImageMime => EXT_MIME[k.split(".").pop() ?? ""] ?? "image/png";

/** Identify an image by its magic bytes (never trust the client's Content-Type). SVG is intentionally not allowed. */
export function sniffImage(b: Buffer): ImageMime | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && (b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a")) return "image/gif";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

class LocalStorage implements Storage {
  private file(key: string) {
    if (!isValidKey(key)) throw new Error("Invalid storage key");
    return path.join(path.resolve(env.localUploadDir), key);
  }
  async put(key: string, body: Buffer) {
    await fs.mkdir(path.resolve(env.localUploadDir), { recursive: true });
    await fs.writeFile(this.file(key), body);
  }
  async get(key: string) {
    try { return { body: await fs.readFile(this.file(key)), contentType: mimeForKey(key) }; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  }
  async remove(key: string) {
    try { await fs.unlink(this.file(key)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
}

/** S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, ...). The AWS SDK is loaded lazily. */
class S3Storage implements Storage {
  private ctx?: Promise<{ client: import("@aws-sdk/client-s3").S3Client; sdk: typeof import("@aws-sdk/client-s3") }>;
  private async c() {
    this.ctx ??= import("@aws-sdk/client-s3").then((sdk) => {
      const cfg = env.s3;
      if (!cfg.bucket) throw new Error("S3_BUCKET is not set");
      const client = new sdk.S3Client({
        region: cfg.region,
        endpoint: cfg.endpoint,
        forcePathStyle: cfg.forcePathStyle,
        credentials: cfg.accessKeyId ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } : undefined,
      });
      return { client, sdk };
    });
    return this.ctx;
  }
  async put(key: string, body: Buffer, contentType: string) {
    const { client, sdk } = await this.c();
    await client.send(new sdk.PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string) {
    const { client, sdk } = await this.c();
    try {
      const res = await client.send(new sdk.GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return { body: Buffer.from(bytes), contentType: res.ContentType ?? mimeForKey(key) };
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") return null;
      throw e;
    }
  }
  async remove(key: string) {
    const { client, sdk } = await this.c();
    await client.send(new sdk.DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
  }
}

const g = globalThis as unknown as { __quizStorage?: { driver: string; impl: Storage } };
export function getStorage(): Storage {
  const driver = env.storageDriver;
  if (!g.__quizStorage || g.__quizStorage.driver !== driver) {
    g.__quizStorage = { driver, impl: driver === "s3" ? new S3Storage() : new LocalStorage() };
  }
  return g.__quizStorage.impl;
}
