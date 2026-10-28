import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env";
import { IMAGE_EXT, isLocalKey, mimeFromKey, type ImageMime, type Storage } from "./types";

/** Files on disk (LOCAL_UPLOAD_DIR). Used for development and when no UploadThing token is configured. */
export class LocalStorage implements Storage {
  private file(key: string) {
    if (!isLocalKey(key)) throw new Error("Invalid storage key");
    return path.join(path.resolve(env.localUploadDir), key);
  }
  async put(bytes: Buffer, mime: ImageMime) {
    const key = `${randomUUID()}.${IMAGE_EXT[mime]}`;
    await fs.mkdir(path.resolve(env.localUploadDir), { recursive: true });
    await fs.writeFile(this.file(key), bytes);
    return key;
  }
  async get(key: string) {
    try { return { body: await fs.readFile(this.file(key)), contentType: mimeFromKey(key) }; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
  }
  async remove(key: string) {
    try { await fs.unlink(this.file(key)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
}
