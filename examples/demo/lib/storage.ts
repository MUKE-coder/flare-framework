import { env } from "cloudflare:workers";
import { createObjectKey, createStorage } from "@flare/core";

/**
 * File storage on the `STORAGE` R2 bucket.
 *
 * `createUploadUrl` / `createReadUrl` return short-lived signed URLs redeemed by
 * `app/api/storage/route.ts`. A URL grants access to whoever holds it, so check
 * that the current user may upload or view the object before issuing one.
 *
 *   const { url } = await storage.createUploadUrl({
 *     key: createObjectKey(file.name, `users/${user.id}`),
 *     contentTypes: ["image/*", "application/pdf"],
 *     maxBytes: 10 * 1024 * 1024,
 *   });
 *   // browser: fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
 *
 *   const src = await storage.createReadUrl({ key });
 */
export const storage = createStorage({
  bucket: env.STORAGE,
  // Signing keys are derived from the auth secret with a storage-specific label.
  secret: env.BETTER_AUTH_SECRET,
});

export { createObjectKey };
