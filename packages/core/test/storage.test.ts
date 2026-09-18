import { afterEach, describe, expect, it, vi } from "vitest";
import { importSigningKey, signToken, verifyToken } from "../src/signing.js";
import { createObjectKey, createStorage, matchesContentType, type StorageBucket } from "../src/storage.js";

/** In-memory stand-in for an R2 bucket binding. */
function memoryBucket() {
  const objects = new Map<string, { data: Uint8Array; contentType?: string }>();
  const bucket: StorageBucket = {
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: new Response(object.data as BodyInit).body!,
        size: object.data.byteLength,
        httpEtag: '"etag"',
        httpMetadata: { contentType: object.contentType },
      };
    },
    async put(key, value, options) {
      const data = new Uint8Array(await new Response(value).arrayBuffer());
      objects.set(key, { data, contentType: options?.httpMetadata?.contentType });
    },
    async delete(keys) {
      for (const key of [keys].flat()) objects.delete(key);
    },
  };
  return { bucket, objects };
}

const ORIGIN = "https://app.test";
const SECRET = "test-secret-with-enough-entropy-0123456789";

function setup(secret = SECRET) {
  const { bucket, objects } = memoryBucket();
  return { storage: createStorage({ bucket, secret }), objects, bucket };
}

/** The 8-byte PNG signature, then some bytes: enough to pass content sniffing. */
const PNG = (rest = "png-bytes") => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode(rest)]);

function put(url: string, body: string | Uint8Array, contentType: string, headers: Record<string, string> = {}) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return new Request(ORIGIN + url, {
    method: "PUT",
    body: bytes as BodyInit,
    headers: { "content-type": contentType, "content-length": String(bytes.byteLength), ...headers },
  });
}

afterEach(() => vi.useRealTimers());

describe("signed tokens", () => {
  it("round-trips and rejects tampering", async () => {
    const key = await importSigningKey(SECRET, "test");
    const token = await signToken(key, { a: 1 });
    expect(await verifyToken(key, token)).toEqual({ a: 1 });

    const [body, sig] = token.split(".");
    const forgedBody = btoa(JSON.stringify({ a: 2 })).replace(/=+$/, "");
    expect(await verifyToken(key, `${forgedBody}.${sig}`)).toBeNull();
    expect(await verifyToken(key, `${body}.${sig}x`)).toBeNull();
    expect(await verifyToken(key, "not-a-token")).toBeNull();
  });

  it("derives unrelated keys per purpose and per secret", async () => {
    const token = await signToken(await importSigningKey(SECRET, "storage"), { a: 1 });
    expect(await verifyToken(await importSigningKey(SECRET, "other"), token)).toBeNull();
    expect(await verifyToken(await importSigningKey("different-secret", "storage"), token)).toBeNull();
  });
});

describe("matchesContentType", () => {
  it("matches exact types and wildcards, ignoring parameters and case", () => {
    expect(matchesContentType("image/PNG", ["image/*"])).toBe(true);
    expect(matchesContentType("application/pdf; charset=binary", ["application/pdf"])).toBe(true);
    expect(matchesContentType("text/html", ["image/*", "application/pdf"])).toBe(false);
    expect(matchesContentType("", ["image/*"])).toBe(false);
    expect(matchesContentType("imagexpng", ["image/*"])).toBe(false);
  });
});

describe("createObjectKey", () => {
  it("prefixes, dates, and sanitizes", () => {
    const key = createObjectKey("../Quarterly Report (final).pdf", "docs/");
    expect(key).toMatch(/^docs\/\d{4}\/\d{2}\/[0-9a-f-]{36}-Quarterly-Report-final-.pdf$/);
    expect(key).not.toContain("..");
  });
});

describe("storage", () => {
  it("uploads with a signed URL, then reads it back", async () => {
    const { storage, objects } = setup();
    const upload = await storage.createUploadUrl({ key: "uploads/a.png", contentTypes: ["image/*"], maxBytes: 100 });
    expect(upload.url).toMatch(/^\/api\/storage\?token=[\w-]+\.[\w-]+$/);

    const res = await storage.handleRequest(put(upload.url, PNG(), "image/png"));
    expect(res.status).toBe(201);
    expect(objects.get("uploads/a.png")?.contentType).toBe("image/png");

    const read = await storage.handleRequest(new Request(ORIGIN + (await storage.createReadUrl({ key: "uploads/a.png" }))));
    expect(read.status).toBe(200);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(PNG());
    expect(read.headers.get("content-type")).toBe("image/png");
    expect(read.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''a.png");
  });

  it("rejects disallowed content types, oversize bodies, and missing length", async () => {
    const { storage, objects } = setup();
    const { url } = await storage.createUploadUrl({ key: "k", contentTypes: ["image/*"], maxBytes: 5 });

    expect((await storage.handleRequest(put(url, "<script>", "text/html"))).status).toBe(415);
    expect((await storage.handleRequest(put(url, "123456", "image/png"))).status).toBe(413);
    const noLength = new Request(ORIGIN + url, { method: "PUT", body: "12", headers: { "content-type": "image/png" } });
    expect((await storage.handleRequest(noLength)).status).toBe(411);
    expect(objects.size).toBe(0);
  });

  it("rejects files whose bytes contradict their Content-Type", async () => {
    const { storage, objects } = setup();
    const { url } = await storage.createUploadUrl({ key: "k", contentTypes: ["image/*", "application/pdf"], maxBytes: 1000 });

    // An HTML page labelled as a PNG, and a PNG labelled as a PDF.
    const html = put(url, "<html><script>alert(1)</script></html>", "image/png");
    const res = await storage.handleRequest(html);
    expect(res.status).toBe(415);
    expect(((await res.json()) as { error: string }).error).toMatch(/contents don't match its type \(image\/png\)/);
    expect(html.bodyUsed).toBe(true);
    expect((await storage.handleRequest(put(url, PNG(), "application/pdf"))).status).toBe(415);
    expect(objects.size).toBe(0);

    // The real thing passes, and arrives intact even when the body spans many chunks.
    const big = PNG("x".repeat(900));
    expect((await storage.handleRequest(put(url, big, "image/png"))).status).toBe(201);
    expect(objects.get("k")?.data).toEqual(big);
  });

  it("drains the body of rejected uploads", async () => {
    const { storage } = setup();
    const { url } = await storage.createUploadUrl({ key: "k", contentTypes: ["image/*"], maxBytes: 5 });
    const request = put(url, "far-too-large-body", "image/png");
    expect((await storage.handleRequest(request)).status).toBe(413);
    expect(request.bodyUsed).toBe(true);
  });

  it("rejects forged, cross-operation, and expired tokens", async () => {
    const { storage } = setup();
    const { url } = await storage.createUploadUrl({ key: "k", contentTypes: ["image/*"], maxBytes: 5 });
    const readUrl = await storage.createReadUrl({ key: "k" });

    // Another app's secret.
    const other = setup("another-secret-entirely-9876543210");
    expect((await other.storage.handleRequest(put(url, "x", "image/png"))).status).toBe(403);
    // Upload token used to read, read token used to upload.
    expect((await storage.handleRequest(new Request(ORIGIN + url))).status).toBe(403);
    expect((await storage.handleRequest(put(readUrl, "x", "image/png"))).status).toBe(403);
    // Missing token.
    expect((await storage.handleRequest(new Request(ORIGIN + "/api/storage"))).status).toBe(400);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    expect((await storage.handleRequest(put(url, "x", "image/png"))).status).toBe(403);
  });

  it("forces risky types to download in a sandbox", async () => {
    const { storage, bucket } = setup();
    await bucket.put("evil.svg", "<svg onload=alert(1)>", { httpMetadata: { contentType: "image/svg+xml" } });
    const res = await storage.handleRequest(new Request(ORIGIN + (await storage.createReadUrl({ key: "evil.svg" }))));
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("serves downloads as attachments with the requested name", async () => {
    const { storage, bucket } = setup();
    await bucket.put("k.pdf", "pdf", { httpMetadata: { contentType: "application/pdf" } });
    const url = await storage.createReadUrl({ key: "k.pdf", downloadAs: "Report Q3.pdf" });
    const res = await storage.handleRequest(new Request(ORIGIN + url));
    expect(res.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''Report%20Q3.pdf");
  });

  it("refuses path-traversal keys and returns 404 for missing objects", async () => {
    const { storage } = setup();
    await expect(storage.createUploadUrl({ key: "../etc", contentTypes: ["*/*"], maxBytes: 1 })).rejects.toThrow();
    await expect(storage.createReadUrl({ key: "/abs" })).rejects.toThrow();
    const res = await storage.handleRequest(new Request(ORIGIN + (await storage.createReadUrl({ key: "missing" }))));
    expect(res.status).toBe(404);
  });

  it("supports absolute URLs and rejects unsupported methods", async () => {
    const { bucket } = memoryBucket();
    const storage = createStorage({ bucket, secret: SECRET, baseURL: "https://files.example.com/" });
    const url = await storage.createReadUrl({ key: "k" });
    expect(url.startsWith("https://files.example.com/api/storage?token=")).toBe(true);
    const res = await storage.handleRequest(new Request(url, { method: "DELETE" }));
    expect(res.status).toBe(405);
  });
});
