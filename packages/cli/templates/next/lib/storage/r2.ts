import { AwsClient } from "aws4fetch";
import type { StorageBucket, StorageObjectBody } from "@flaredev/core";

/**
 * Files on R2, over its S3-compatible API — so this also drives any S3 that will take
 * a signed request: MinIO in `docker compose`, Backblaze B2, S3 itself.
 *
 * R2 rather than Vercel Blob for one reason: R2 charges nothing to serve what it
 * stores. On a file-heavy app that is the difference between a small bill and a large
 * one, and it costs nothing to use from outside Cloudflare — see the cost guide.
 *
 * `aws4fetch` signs the requests; it is a few kilobytes and works in any runtime,
 * unlike the AWS SDK. There is no `publicUrl`: the bucket is private, and reads are
 * signed and proxied by this app so a policy still decides who may see a file.
 */

export interface R2Options {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function r2Bucket(options: R2Options): StorageBucket {
  const client = new AwsClient({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const endpoint = `${options.endpoint}/${options.bucket}`;

  /**
   * A key as a URL path.
   *
   * Each segment is escaped on its own, so the slashes in "products/2026/09/a.png" stay
   * slashes. Escaping the whole key would turn them into %2F, which is a different
   * object name to S3 even where a particular server is forgiving about it.
   */
  const path = (key: string) => key.split("/").map(encodeURIComponent).join("/");

  /** Raise a bucket error rather than letting a failed write look like a successful one. */
  const ok = async (response: Response, doing: string, key: string): Promise<Response> => {
    if (response.ok) return response;
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage ${doing} failed for "${key}": ${response.status} ${detail.slice(0, 300)}`);
  };

  return {
    async get(key: string): Promise<StorageObjectBody | null> {
      const response = await client.fetch(`${endpoint}/${path(key)}`);
      if (!response.ok || !response.body) return null;
      return {
        body: response.body,
        httpMetadata: { contentType: response.headers.get("content-type") ?? undefined },
        size: Number(response.headers.get("content-length") ?? 0),
        // R2 returns the object's ETag quoted, which is what the header wants back.
        httpEtag: response.headers.get("etag") ?? "",
      };
    },

    async put(key, value, putOptions) {
      // S3 needs a Content-Length, and a stream has no length to send — it answers
      // "411 MissingContentLength" and stores nothing. Uploads are capped by the field's
      // own maxBytes long before they reach here, so reading one into memory is safe and
      // is what makes the length known.
      //
      // The length is set by hand rather than left to fetch. Next patches the global
      // fetch, and in that runtime it does not derive content-length even from a buffered
      // body — so S3 still answers 411 and stores nothing. Buffering everything through
      // Response keeps one path for streams, buffers and strings alike.
      const body = value === null ? new ArrayBuffer(0) : await new Response(value as BodyInit).arrayBuffer();
      const headers: Record<string, string> = { "content-length": String(body.byteLength) };
      if (putOptions?.httpMetadata?.contentType) headers["content-type"] = putOptions.httpMetadata.contentType;
      await ok(await client.fetch(`${endpoint}/${path(key)}`, { method: "PUT", body, headers }), "upload", key);
    },

    async delete(keys) {
      for (const key of [keys].flat()) {
        const response = await client.fetch(`${endpoint}/${path(key)}`, { method: "DELETE" });
        // S3 answers 204 for a key that was never there, which is the outcome we wanted.
        if (response.status !== 404) await ok(response, "delete", key);
      }
    },
  };
}
