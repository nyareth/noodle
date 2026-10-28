import { randomUUID } from "node:crypto";
import { env } from "../env";
import { IMAGE_EXT, sniffImage, type ImageMime, type Storage } from "./types";

/** The few UTApi methods we use (lets tests pass a stub). */
export interface UtApiLike {
  uploadFiles(file: File): Promise<{ data: { key: string } | null; error: { message: string } | null }>;
  deleteFiles(keys: string | string[]): Promise<unknown>;
  generateSignedURL(key: string, opts?: { expiresIn?: string | number }): Promise<{ ufsUrl: string }>;
}

async function createUtApi(): Promise<UtApiLike> {
  const token = env.uploadthingToken;
  if (!token) throw new Error("UPLOADTHING_TOKEN is not set (create one in the UploadThing dashboard > API Keys).");
  const { UTApi } = await import("uploadthing/server");
  return new UTApi({ token });
}

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Question images and subject banners stored on UploadThing.
 *
 * Uploads are made from the server with UTApi (no callback URL is needed, so it also works on a campus
 * network that UploadThing cannot reach). Images are read back through the app (/api/images/<key>), which keeps
 * them behind the login. Works whether the UploadThing app serves files publicly or privately: the public URL is tried
 * first, and a short-lived signed URL is used if the CDN answers 401/403.
 */
export class UploadThingStorage implements Storage {
  private apiPromise?: Promise<UtApiLike>;
  constructor(private deps: { api?: () => Promise<UtApiLike>; fetch?: typeof fetch } = {}) {}

  private api() {
    return (this.apiPromise ??= (this.deps.api ?? createUtApi)());
  }

  async put(bytes: Buffer, mime: ImageMime) {
    const api = await this.api();
    const file = new File([new Uint8Array(bytes)], `${randomUUID()}.${IMAGE_EXT[mime]}`, { type: mime });
    const res = await api.uploadFiles(file);
    if (res.error || !res.data) throw new Error(`UploadThing upload failed: ${res.error?.message ?? "no data returned"}`);
    return res.data.key;
  }

  async get(key: string) {
    const api = await this.api();
    const doFetch = this.deps.fetch ?? fetch;
    const signed = (await api.generateSignedURL(key, { expiresIn: "5 minutes" })).ufsUrl;
    const publicUrl = signed.split("?")[0]!;
    let res = await doFetch(publicUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 401 || res.status === 403) res = await doFetch(signed, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 404 || res.status === 403 || res.status === 401) return null;
    if (!res.ok) throw new Error(`UploadThing returned ${res.status} for ${key}`);
    const body = Buffer.from(await res.arrayBuffer());
    const mime = sniffImage(body);
    return mime ? { body, contentType: mime } : null;
  }

  async remove(key: string) {
    const api = await this.api();
    await api.deleteFiles(key);
  }
}
