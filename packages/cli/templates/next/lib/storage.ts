import { createObjectKey, createStorage, type StorageBucket } from "@flaredev/core";
import { cloudinaryBucket } from "./storage/cloudinary";
import { diskBucket } from "./storage/disk";
import { r2Bucket } from "./storage/r2";
import { uploadThingBucket } from "./storage/uploadthing";

/**
 * Where uploaded files go.
 *
 * One of four drivers, chosen by `STORAGE_DRIVER`. Everything above this line is the
 * same whichever you pick — the `file` field, the upload widget, `createUploadUrl` and
 * `createReadUrl` — because a driver only has to answer three questions: store these
 * bytes, give them back, throw them away.
 *
 *   r2           S3-compatible: R2, MinIO, B2, S3. The default, and what
 *                `docker compose up` gives you locally.
 *   disk         The local filesystem, like Laravel's `local` disk. No account,
 *                no network. One machine only.
 *   cloudinary   A CDN with an image pipeline. Serves from res.cloudinary.com.
 *   uploadthing  A CDN with an uploader. Serves from <app>.ufs.sh.
 *
 * The drivers are in `lib/storage/`, in your repository, and are ordinary files you can
 * read and change. Adding a fifth means writing `get`, `put` and `delete` — see
 * `lib/storage/disk.ts`, which is the shortest of them.
 *
 * ## Private by default, and what breaks that
 *
 * With `r2` or `disk`, a read URL is a short-lived signed token redeemed by
 * `app/api/storage/route.ts`, so whoever issued it decided the viewer was allowed it.
 *
 * `cloudinary` and `uploadthing` are content delivery networks, and serving through
 * this app would throw away the thing you are paying them for. So they hand back their
 * own URL, which **anyone with the link can read, forever**. That is the normal way to
 * use them and the wrong way to store a medical record. Set `STORAGE_PUBLIC=false` to
 * keep every read signed and proxied, and they become ordinary private storage.
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

type StorageDriver = "r2" | "disk" | "cloudinary" | "uploadthing";

const DRIVERS: StorageDriver[] = ["r2", "disk", "cloudinary", "uploadthing"];

/** Required environment, named in the error rather than left as `undefined`. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`STORAGE_DRIVER is "${driver}" and needs ${name}, which is not set.`);
  return value;
}

const configured = (process.env.STORAGE_DRIVER ?? "r2").trim().toLowerCase();
if (!DRIVERS.includes(configured as StorageDriver)) {
  throw new Error(`Unknown STORAGE_DRIVER "${configured}". One of: ${DRIVERS.join(", ")}.`);
}
const driver = configured as StorageDriver;

/** Public delivery is the point of a CDN, so it is on unless it is turned off. */
const publicDelivery = process.env.STORAGE_PUBLIC !== "false";

function selectBucket(): StorageBucket {
  switch (driver) {
    case "disk":
      return diskBucket({ dir: process.env.STORAGE_DIR });
    case "cloudinary":
      return cloudinaryBucket({
        cloudName: required("CLOUDINARY_CLOUD_NAME"),
        apiKey: required("CLOUDINARY_API_KEY"),
        apiSecret: required("CLOUDINARY_API_SECRET"),
        publicDelivery,
      });
    case "uploadthing":
      return uploadThingBucket({
        token: required("UPLOADTHING_TOKEN"),
        appId: required("UPLOADTHING_APP_ID"),
        publicDelivery,
      });
    case "r2":
      return r2Bucket({
        endpoint: required("R2_ENDPOINT"),
        bucket: required("R2_BUCKET"),
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      });
  }
}

export const storage = createStorage({
  bucket: selectBucket(),
  // Signing keys are derived from the auth secret with a storage-specific label.
  secret: process.env.BETTER_AUTH_SECRET ?? "",
});

export { createObjectKey };
