import assert from "node:assert/strict";
import test from "node:test";
import { isLocalKey, isSafeKey, sniffImage } from "../../src/lib/storage/types";
import { UploadThingStorage, type UtApiLike } from "../../src/lib/storage/uploadthing";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

function stub(over: Partial<UtApiLike> = {}) {
  const calls = { uploaded: [] as File[], deleted: [] as unknown[] };
  const api: UtApiLike = {
    async uploadFiles(file) { calls.uploaded.push(file); return { data: { key: "AbC123xyz789" }, error: null }; },
    async deleteFiles(keys) { calls.deleted.push(keys); return { success: true }; },
    async generateSignedURL(key) { return { ufsUrl: `https://app1.ufs.sh/f/${key}?signature=hmac-sha256%3Dabc&expires=9` }; },
    ...over,
  };
  return { api, calls, storage: (fetchImpl: typeof fetch) => new UploadThingStorage({ api: async () => api, fetch: fetchImpl }) };
}
const reply = (status: number, body: Buffer | string = "") => new Response(typeof body === "string" ? body : new Uint8Array(body), { status });

test("put uploads a correctly named and typed file and returns UploadThing's key", async () => {
  const { calls, storage } = stub();
  const key = await storage(fetch).put(PNG, "image/png");
  assert.equal(key, "AbC123xyz789");
  assert.equal(calls.uploaded.length, 1);
  assert.match(calls.uploaded[0]!.name, /^[0-9a-f-]{36}\.png$/);
  assert.equal(calls.uploaded[0]!.type, "image/png");
  assert.equal(calls.uploaded[0]!.size, PNG.length);
});

test("put surfaces an UploadThing error", async () => {
  const { storage } = stub({ uploadFiles: async () => ({ data: null, error: { message: "token invalid" } }) });
  await assert.rejects(storage(fetch).put(PNG, "image/png"), /token invalid/);
});

test("get reads the public URL first (no signature)", async () => {
  const { storage } = stub();
  const urls: string[] = [];
  const got = await storage(async (u) => { urls.push(String(u)); return reply(200, PNG); }).get("AbC123xyz789");
  assert.deepEqual(urls, ["https://app1.ufs.sh/f/AbC123xyz789"]);
  assert.equal(got?.contentType, "image/png");
  assert.ok(got!.body.equals(PNG));
});

test("get falls back to a signed URL when the app serves files privately", async () => {
  const { storage } = stub();
  const urls: string[] = [];
  const got = await storage(async (u) => { urls.push(String(u)); return urls.length === 1 ? reply(403) : reply(200, PNG); }).get("AbC123xyz789");
  assert.equal(urls.length, 2);
  assert.match(urls[1]!, /signature=/);
  assert.ok(got);
});

test("get returns null for a missing file or for bytes that are not an image, and throws on server errors", async () => {
  const { storage } = stub();
  assert.equal(await storage(async () => reply(404)).get("AbC123xyz789"), null);
  assert.equal(await storage(async () => reply(200, "<html>not an image</html>")).get("AbC123xyz789"), null);
  await assert.rejects(storage(async () => reply(500)).get("AbC123xyz789"), /500/);
});

test("remove deletes by key", async () => {
  const { calls, storage } = stub();
  await storage(fetch).remove("AbC123xyz789");
  assert.deepEqual(calls.deleted, ["AbC123xyz789"]);
});

test("image sniffing and key checks", () => {
  assert.equal(sniffImage(PNG), "image/png");
  assert.equal(sniffImage(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(isLocalKey("0b9f7c4e-1111-4222-8333-444455556666.png"), true);
  assert.equal(isLocalKey("AbC123xyz789"), false);
  assert.equal(isSafeKey("AbC123xyz789"), true);
  assert.equal(isSafeKey("../etc/passwd"), false);
  assert.equal(isSafeKey("a/b"), false);
});
