import type { StorageBucket, StorageObjectBody } from "@flaredev/core";

/**
 * Files on Cloudinary.
 *
 * Cloudinary is a CDN with an image pipeline attached, so this bucket serves reads from
 * `res.cloudinary.com` rather than streaming them back through the app — see
 * `publicUrl` below, and read what it says about privacy before choosing this one.
 *
 * Plain `fetch` and Web Crypto, no SDK: the signing is a sorted query string and a
 * hash, and the upload is a multipart POST.
 */

export interface CloudinaryOptions {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /**
   * Serve reads straight from Cloudinary's CDN. Default true, because it is the reason
   * to use Cloudinary. See {@link StorageBucket.publicUrl}: those files are readable by
   * anyone with the link. Set it false to keep every read signed and proxied, and
   * Cloudinary becomes storage with a good image pipeline you reach for deliberately.
   */
  publicDelivery?: boolean;
}

/**
 * Cloudinary stores an asset under one of three resource types and the type is part of
 * its URL, so upload and read have to agree on which. The key's extension decides, and
 * it decides the same way in both directions — `createObjectKey` keeps the extension
 * from the uploaded filename, so in practice this is the type the file really is.
 *
 * A key with no extension is `raw`, which serves the bytes back unchanged. That is the
 * safe answer rather than the clever one.
 */
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff?|heic|heif)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v|avi|mkv|ogv|mp3|m4a|wav|ogg|aac|flac)$/i;

export function resourceType(key: string): "image" | "video" | "raw" {
  if (IMAGE.test(key)) return "image";
  // Cloudinary files audio under "video"; it is one pipeline.
  if (VIDEO.test(key)) return "video";
  return "raw";
}

/** Hex SHA-1, which is what Cloudinary's signatures use by default. */
async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Cloudinary's signature: every signed parameter as `name=value`, sorted by name,
 * joined with `&`, the API secret appended with no separator, then SHA-1.
 *
 * `file`, `api_key`, `resource_type` and `cloud_name` are never signed.
 */
export async function sign(params: Record<string, string>, apiSecret: string): Promise<string> {
  const toSign = Object.keys(params)
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join("&");
  return sha1Hex(toSign + apiSecret);
}

export function cloudinaryBucket(options: CloudinaryOptions): StorageBucket {
  const { cloudName, apiKey, apiSecret } = options;
  const publicDelivery = options.publicDelivery ?? true;
  const api = (type: string, action: string) => `https://api.cloudinary.com/v1_1/${cloudName}/${type}/${action}`;

  /**
   * The key, as a Cloudinary public id.
   *
   * An `image` or `video` public id carries no extension — Cloudinary appends the
   * format, and leaving it on produces `photo.png.png`. A `raw` asset keeps it, because
   * for raw the public id is the whole filename.
   */
  const publicId = (key: string) => (resourceType(key) === "raw" ? key : key.replace(/\.[^./]+$/, ""));

  /** The delivery URL for a key, which is public whether or not it is handed out. */
  const deliveryUrl = (key: string) =>
    `https://res.cloudinary.com/${cloudName}/${resourceType(key)}/upload/${publicId(key)
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;

  return {
    async get(key: string): Promise<StorageObjectBody | null> {
      const response = await fetch(deliveryUrl(key));
      if (!response.ok || !response.body) return null;
      return {
        body: response.body,
        size: Number(response.headers.get("content-length") ?? 0),
        httpEtag: response.headers.get("etag") ?? "",
        httpMetadata: { contentType: response.headers.get("content-type") ?? undefined },
      };
    },

    async put(key, value, putOptions) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      // `overwrite` and `invalidate` so re-uploading a key replaces what the CDN serves
      // rather than leaving the old bytes cached at the edge under the same URL.
      const signed: Record<string, string> = {
        public_id: publicId(key),
        timestamp,
        overwrite: "true",
        invalidate: "true",
      };

      const form = new FormData();
      const body = value === null ? new ArrayBuffer(0) : await new Response(value as BodyInit).arrayBuffer();
      const contentType = putOptions?.httpMetadata?.contentType;
      form.append("file", new Blob([body], contentType ? { type: contentType } : undefined), key.split("/").pop() ?? "file");
      form.append("api_key", apiKey);
      form.append("signature", await sign(signed, apiSecret));
      for (const [name, entry] of Object.entries(signed)) form.append(name, entry);

      const response = await fetch(api(resourceType(key), "upload"), { method: "POST", body: form });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Cloudinary upload failed for "${key}": ${response.status} ${detail.slice(0, 300)}`);
      }
    },

    async delete(keys) {
      for (const key of [keys].flat()) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const signed = { public_id: publicId(key), timestamp, invalidate: "true" };
        const form = new FormData();
        form.append("api_key", apiKey);
        form.append("signature", await sign(signed, apiSecret));
        for (const [name, entry] of Object.entries(signed)) form.append(name, entry);

        const response = await fetch(api(resourceType(key), "destroy"), { method: "POST", body: form });
        // `destroy` answers 200 with result "not found" for a key that was never there,
        // which is the outcome asked for. Only a transport-level failure is an error.
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(`Cloudinary delete failed for "${key}": ${response.status} ${detail.slice(0, 300)}`);
        }
      }
    },

    publicUrl: publicDelivery ? (key: string) => deliveryUrl(key) : undefined,
  };
}
