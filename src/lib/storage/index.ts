import { env } from "../env";
import { LocalStorage } from "./local";
import { isLocalKey, type ImageMime, type Storage } from "./types";
import { UploadThingStorage } from "./uploadthing";

export { IMAGE_EXT, isSafeKey, sniffImage, type ImageMime, type Storage } from "./types";

/** New files go to UploadThing; images saved earlier by the local driver are still served (and deleted) locally. */
class WithLocalFallback implements Storage {
  constructor(private primary: Storage, private local: Storage) {}
  put(bytes: Buffer, mime: ImageMime) { return this.primary.put(bytes, mime); }
  get(key: string) { return (isLocalKey(key) ? this.local : this.primary).get(key); }
  remove(key: string) { return (isLocalKey(key) ? this.local : this.primary).remove(key); }
}

const g = globalThis as unknown as { __noodleStorage?: { driver: string; impl: Storage } };

/** STORAGE_DRIVER=local|uploadthing; when unset, UploadThing is used if UPLOADTHING_TOKEN is present. */
export function getStorage(): Storage {
  const driver = env.storageDriver;
  if (!g.__noodleStorage || g.__noodleStorage.driver !== driver) {
    const local = new LocalStorage();
    g.__noodleStorage = { driver, impl: driver === "uploadthing" ? new WithLocalFallback(new UploadThingStorage(), local) : local };
  }
  return g.__noodleStorage.impl;
}
