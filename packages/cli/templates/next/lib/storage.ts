import { AwsClient } from "aws4fetch";
import { createObjectKey, createStorage } from "@flaredev/core";

/**
 * File storage on R2, over its S3-compatible API.
 *
 * R2 rather than Vercel Blob for one reason: R2 charges nothing to serve what it
 * stores. On a file-heavy app that is the difference between a small bill and a large
 * one, and it costs nothing to use from outside Cloudflare — see the cost guide.
 *
 * `aws4fetch` signs the requests; it is a few kilobytes and works in any runtime, unlike
 * the AWS SDK. Everything above this — the upload widget, the signed-URL helpers, the
 * file field — is the same code the Cloudflare stack runs.
 */
const client = new AwsClient({
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  service: "s3",
  region: "auto",
});

const endpoint = `${process.env.R2_ENDPOINT ?? ""}/${process.env.R2_BUCKET ?? ""}`;

/** The bucket, shaped the way @flaredev/core expects, over plain HTTP calls. */
const bucket = {
  async get(key: string) {
    const response = await client.fetch(`${endpoint}/${encodeURIComponent(key)}`);
    if (!response.ok || !response.body) return null;
    return {
      body: response.body,
      httpMetadata: { contentType: response.headers.get("content-type") ?? undefined },
      size: Number(response.headers.get("content-length") ?? 0),
      // R2 returns the object's ETag quoted, which is what the header wants back.
      httpEtag: response.headers.get("etag") ?? "",
    };
  },
  async put(key: string, value: ReadableStream | ArrayBuffer | string | null, options?: { httpMetadata?: { contentType?: string } }) {
    await client.fetch(`${endpoint}/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: value,
      headers: options?.httpMetadata?.contentType ? { "content-type": options.httpMetadata.contentType } : undefined,
    });
  },
  async delete(keys: string | string[]) {
    for (const key of [keys].flat()) {
      await client.fetch(`${endpoint}/${encodeURIComponent(key)}`, { method: "DELETE" });
    }
  },
};

export const storage = createStorage({
  bucket,
  // Signing keys are derived from the auth secret with a storage-specific label.
  secret: process.env.BETTER_AUTH_SECRET ?? "",
});

export { createObjectKey };
