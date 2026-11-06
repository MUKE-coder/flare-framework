import { env } from "cloudflare:workers";
import { createObjectKey, createStorage, type StorageBucket } from "@flaredev/core";
import { cloudinaryBucket } from "./storage/cloudinary";
import { uploadThingBucket } from "./storage/uploadthing";

/**
 * Where uploaded files go.
 *
 * The default is the `STORAGE` R2 bucket this app is already bound to: no account to
 * create, no keys to copy, and Wrangler simulates it locally as a directory. Set
 * `STORAGE_DRIVER` to send files to a content delivery network instead.
 *
 *   r2           The bound bucket. The default, and nothing to configure.
 *   cloudinary   A CDN with an image pipeline. Serves from res.cloudinary.com.
 *   uploadthing  A CDN with an uploader. Serves from <app>.ufs.sh.
 *
 * The drivers are in `lib/storage/`, in your repository, and are ordinary files you can
 * read and change. Adding one means writing `get`, `put` and `delete`.
 *
 * `disk` exists on the Next.js stack and not here: a Worker has no filesystem to write
 * to, and the bound bucket already covers what it is for.
 *
 * ## Private by default, and what breaks that
 *
 * With `r2`, a read URL is a short-lived signed token redeemed by
 * `app/api/storage/route.ts`, so whoever issued it decided the viewer was allowed it.
 *
 * `cloudinary` and `uploadthing` are content delivery networks, and serving through
 * this Worker would throw away the thing you are paying them for. So they hand back
 * their own URL, which **anyone with the link can read, forever**. That is the normal
 * way to use them and the wrong way to store a medical record. Set
 * `STORAGE_PUBLIC=false` to keep every read signed and proxied.
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

type StorageDriver = "r2" | "cloudinary" | "uploadthing";

const DRIVERS: StorageDriver[] = ["r2", "cloudinary", "uploadthing"];

const vars = env as unknown as Record<string, string | undefined>;

const configured = (vars.STORAGE_DRIVER ?? "r2").trim().toLowerCase();
if (!DRIVERS.includes(configured as StorageDriver)) {
  throw new Error(`Unknown STORAGE_DRIVER "${configured}". One of: ${DRIVERS.join(", ")}.`);
}
const driver = configured as StorageDriver;

/** Required configuration, named in the error rather than left as `undefined`. */
function required(name: string): string {
  const value = vars[name];
  if (!value) throw new Error(`STORAGE_DRIVER is "${driver}" and needs ${name}, which is not set. Add it with: wrangler secret put ${name}`);
  return value;
}

/** Public delivery is the point of a CDN, so it is on unless it is turned off. */
const publicDelivery = vars.STORAGE_PUBLIC !== "false";

function selectBucket(): StorageBucket {
  switch (driver) {
    case "cloudinary":
      return cloudinaryBucket({
        cloudName: required("CLOUDINARY_CLOUD_NAME"),
        apiKey: required("CLOUDINARY_API_KEY"),
        apiSecret: required("CLOUDINARY_API_SECRET"),
        publicDelivery,
      });
    case "uploadthing":
      return uploadThingBucket({
        // The app id lives inside the token; the driver reads it from there.
        token: required("UPLOADTHING_TOKEN"),
        publicDelivery,
      });
    case "r2":
      return env.STORAGE;
  }
}

export const storage = createStorage({
  bucket: selectBucket(),
  // Signing keys are derived from the auth secret with a storage-specific label.
  secret: env.BETTER_AUTH_SECRET,
});

export { createObjectKey };
