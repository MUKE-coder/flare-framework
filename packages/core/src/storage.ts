import { importSigningKey, signToken, verifyToken } from "./signing.js";
import { SNIFF_BYTES, sniffMatches } from "./sniff.js";

/**
 * Signed upload/read URLs for an R2 bucket binding.
 *
 * Bindings can't produce S3 presigned URLs, so Flare signs its own: a short-lived
 * HMAC token scoped to one operation and one object key, redeemed by a Worker
 * route (`app/api/storage/route.ts`) that streams through the binding. No R2 API
 * credentials or bucket CORS are needed, and it behaves the same in local dev.
 * Trade-off: bytes pass through the Worker, so uploads are capped by the Workers
 * request body limit (100 MB on the free plan).
 *
 * Tokens authorize the holder, so only issue them after checking the current user
 * may upload or read that key.
 */

/** The subset of the R2Bucket binding this module uses (keeps core free of workers-types). */
export interface StorageBucket {
  get(key: string): Promise<StorageObjectBody | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string | null,
    options?: { httpMetadata?: { contentType?: string; contentDisposition?: string } },
  ): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
  /**
   * The keys in the bucket, a page at a time. R2 counts this as a Class A operation —
   * the expensive kind — so call it to answer a question, not on a page people reload.
   */
  list?(options?: { limit?: number; prefix?: string; cursor?: string }): Promise<{
    objects: { key: string; size: number }[];
    truncated: boolean;
    cursor?: string;
  }>;
}

export interface StorageObjectBody {
  body: ReadableStream;
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
}

export interface StorageOptions {
  bucket: StorageBucket;
  /** App secret the signing key is derived from (Flare apps pass BETTER_AUTH_SECRET). */
  secret: string;
  /** Path of the route that redeems tokens. Default "/api/storage". */
  routePath?: string;
  /** Prefix URLs with an origin (e.g. for emails). Default: relative URLs. */
  baseURL?: string;
  /** Default token lifetime in seconds. Default 900 (15 minutes). */
  expiresIn?: number;
}

export interface UploadUrlOptions {
  key: string;
  /** Allowed Content-Type values; "image/*" style wildcards are accepted. */
  contentTypes: string[];
  /** Maximum upload size in bytes. */
  maxBytes: number;
  expiresIn?: number;
}

export interface ReadUrlOptions {
  key: string;
  expiresIn?: number;
  /** Serve as an attachment with this filename instead of inline. */
  downloadAs?: string;
}

type UploadToken = { op: "put"; key: string; types: string[]; max: number; exp: number };
type ReadToken = { op: "get"; key: string; name?: string; exp: number };

const SIGNING_PURPOSE = "storage";
const DEFAULT_EXPIRES_IN = 15 * 60;

export function matchesContentType(contentType: string, allowed: string[]): boolean {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type)) return false;
  return allowed.some((pattern) => {
    const p = pattern.trim().toLowerCase();
    if (p === "*/*") return true;
    return p.endsWith("/*") ? type.startsWith(p.slice(0, -1)) : type === p;
  });
}

/** A collision-free object key, e.g. `uploads/2026/09/3f1c…-quarterly-report.pdf`. */
export function createObjectKey(filename: string, prefix = "uploads"): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safe =
    filename
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(-80) || "file";
  return `${prefix.replace(/\/+$/, "")}/${now.getUTCFullYear()}/${month}/${crypto.randomUUID()}-${safe}`;
}

/** Types that can't execute script when rendered inline. SVG is deliberately excluded. */
const INLINE_SAFE = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|text\/plain|video\/[\w.+-]+|audio\/[\w.+-]+)$/;

function isInlineSafe(contentType: string): boolean {
  return INLINE_SAFE.test(contentType.split(";")[0]!.trim().toLowerCase());
}

function isValidKey(key: string): boolean {
  return key.length > 0 && key.length <= 1024 && !key.startsWith("/") && !key.split("/").includes("..");
}

async function discard(body: ReadableStream): Promise<void> {
  try {
    await drain(body.getReader());
  } catch {
    // The client went away; nothing left to drain.
  }
}

async function drain(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    while (!(await reader.read()).done);
  } catch {
    // The client went away; nothing left to drain.
  }
}

/** Read at least `bytes` bytes (or the whole body, if shorter) without losing them. */
async function readHead(body: ReadableStream<Uint8Array>, bytes: number) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < bytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  const head = new Uint8Array(Math.min(size, bytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= head.length) break;
    const part = chunk.subarray(0, head.length - offset);
    head.set(part, offset);
    offset += part.length;
  }
  return { head, chunks, reader };
}

/**
 * The body again, head chunks first. R2 only accepts streams of known length, so on
 * Workers it's piped through a FixedLengthStream — which also fails the upload if
 * the client sends a different number of bytes than its Content-Length promised.
 */
function replay(chunks: Uint8Array[], reader: ReadableStreamDefaultReader<Uint8Array>, length: number): ReadableStream {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  const FixedLength = (globalThis as { FixedLengthStream?: new (length: number) => TransformStream<Uint8Array, Uint8Array> })
    .FixedLengthStream;
  if (!FixedLength) return source;
  const fixed = new FixedLength(length);
  source.pipeTo(fixed.writable).catch(() => {});
  return fixed.readable;
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export function createStorage(options: StorageOptions) {
  const routePath = options.routePath ?? "/api/storage";
  const defaultExpiresIn = options.expiresIn ?? DEFAULT_EXPIRES_IN;
  let keyPromise: Promise<CryptoKey> | undefined;
  const signingKey = () => (keyPromise ??= importSigningKey(options.secret, SIGNING_PURPOSE));

  const expiry = (seconds = defaultExpiresIn) => Math.floor(Date.now() / 1000) + seconds;
  const urlFor = (token: string) => `${options.baseURL?.replace(/\/+$/, "") ?? ""}${routePath}?token=${token}`;

  async function handle(request: Request): Promise<Response> {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return error(400, "Missing token.");
    const payload = await verifyToken<UploadToken | ReadToken>(await signingKey(), token);
    if (!payload || typeof payload.exp !== "number" || !isValidKey(payload.key)) {
      return error(403, "Invalid token.");
    }
    if (payload.exp < Date.now() / 1000) return error(403, "Token expired.");

    if (request.method === "PUT") {
      if (payload.op !== "put") return error(403, "Token does not allow uploads.");
      const contentType = request.headers.get("content-type") ?? "";
      if (!matchesContentType(contentType, payload.types)) {
        return error(415, `Content-Type must be one of: ${payload.types.join(", ")}.`);
      }
      const length = Number(request.headers.get("content-length"));
      if (!request.headers.has("content-length") || !Number.isInteger(length) || length < 0) {
        return error(411, "Content-Length is required.");
      }
      if (length > payload.max) return error(413, `File exceeds the ${payload.max}-byte limit.`);
      if (!request.body) return error(400, "Missing request body.");

      // The Content-Type is whatever the sender chose; check the bytes agree with it.
      const { head, chunks, reader } = await readHead(request.body, SNIFF_BYTES);
      if (sniffMatches(contentType, head) === false) {
        await drain(reader);
        return error(415, `The file's contents don't match its type (${contentType.split(";")[0]!.trim()}).`);
      }
      await options.bucket.put(payload.key, replay(chunks, reader, length), { httpMetadata: { contentType } });
      return Response.json({ key: payload.key }, { status: 201 });
    }

    if (request.method === "GET" || request.method === "HEAD") {
      if (payload.op !== "get") return error(403, "Token does not allow reads.");
      const object = await options.bucket.get(payload.key);
      if (!object) return error(404, "Not found.");
      const headers = new Headers({
        "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "content-length": String(object.size),
        etag: object.httpEtag,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
      });
      const inline = !payload.name && isInlineSafe(headers.get("content-type")!);
      if (!inline) {
        // Uploaded HTML/SVG/etc. served from the app's origin could run script (stored XSS).
        headers.set("content-security-policy", "default-src 'none'; sandbox");
      }
      const filename = payload.name ?? payload.key.split("/").pop()!;
      headers.set(
        "content-disposition",
        `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      return new Response(request.method === "HEAD" ? null : object.body, { headers });
    }

    return new Response(null, { status: 405, headers: { allow: "GET, HEAD, PUT" } });
  }

  return {
    bucket: options.bucket,

    /** A URL the browser can PUT the file body to, with the `Content-Type` header set. */
    async createUploadUrl(upload: UploadUrlOptions): Promise<{ url: string; method: "PUT"; key: string; expiresAt: Date }> {
      if (!isValidKey(upload.key)) throw new Error(`Invalid object key: ${upload.key}`);
      if (upload.contentTypes.length === 0) throw new Error("contentTypes must list at least one type.");
      const exp = expiry(upload.expiresIn);
      const token = await signToken(await signingKey(), {
        op: "put",
        key: upload.key,
        types: upload.contentTypes,
        max: upload.maxBytes,
        exp,
      } satisfies UploadToken);
      return { url: urlFor(token), method: "PUT", key: upload.key, expiresAt: new Date(exp * 1000) };
    },

    /** A temporary URL that serves the object. */
    async createReadUrl(read: ReadUrlOptions): Promise<string> {
      if (!isValidKey(read.key)) throw new Error(`Invalid object key: ${read.key}`);
      const payload: ReadToken = { op: "get", key: read.key, exp: expiry(read.expiresIn) };
      if (read.downloadAs) payload.name = read.downloadAs;
      return urlFor(await signToken(await signingKey(), payload));
    },

    delete: (key: string) => options.bucket.delete(key),

    /** Handles `PUT <routePath>?token=` (upload) and `GET <routePath>?token=` (read). */
    async handleRequest(request: Request): Promise<Response> {
      const response = await handle(request);
      // Read and discard an unread upload body before rejecting it. Responding with the body
      // unread broke every other request through wrangler's local proxy (clients saw 500
      // "Network connection lost" instead of the 4xx); cancel() did not help. Chunks are
      // dropped as they arrive, so memory stays flat even for a huge rejected upload.
      if (request.body && !request.bodyUsed) await discard(request.body);
      return response;
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
