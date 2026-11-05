import type { StorageBucket, StorageObjectBody } from "@flaredev/core";

/**
 * Files on UploadThing.
 *
 * One wrinkle shapes this whole file: UploadThing mints its own file key on upload, and
 * a bucket is asked to store bytes under a key it was *given*. The two are reconciled
 * with `customId`, which UploadThing accepts at upload, addresses in a delivery URL,
 * and filters by on delete. So Flare's key stays Flare's key and never has to be
 * stored anywhere, which is what would otherwise be needed.
 *
 * A customId is one path segment, so the slashes in `uploads/2026/09/…` are encoded on
 * the way in. {@link customIdFor} is the only place that knows the encoding and both
 * directions go through it.
 *
 * Requires the `uploadthing` package:
 *
 *   pnpm add uploadthing
 */

export interface UploadThingOptions {
  /** From the UploadThing dashboard. Defaults to `UPLOADTHING_TOKEN`. */
  token?: string;
  /**
   * The app id, which is the subdomain files are served from. Defaults to
   * `UPLOADTHING_APP_ID`.
   */
  appId: string;
  /**
   * Serve reads from UploadThing's CDN. Default true, which is the reason to use it.
   * See {@link StorageBucket.publicUrl}: those files are readable by anyone with the
   * link. Set it false and reads are signed and proxied through this app instead.
   */
  publicDelivery?: boolean;
}

/**
 * A Flare key as an UploadThing customId.
 *
 * Percent-encoding with `_` in place of `%`, because `%` in a customId would be decoded
 * again by whatever reads the URL. Every character outside `[A-Za-z0-9.-]` becomes `_`
 * and two hex digits — including `_` itself, which is what makes it reversible.
 *
 * Reversible matters more than it looks. A lossy encoding maps two different keys onto
 * one id, and then an upload overwrites a file it has never heard of and a delete
 * removes somebody else's. The first draft of this mapped `a/b.png` and `a__b.png` to
 * the same id.
 */
export function customIdFor(key: string): string {
  return key.replace(/[^A-Za-z0-9.-]/g, (char) => `_${char.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

/**
 * The part of UTApi this driver uses.
 *
 * Described here rather than imported, so an app that does not use this driver still
 * typechecks without the package installed — which is every app that picked one of the
 * other three.
 */
interface UTApiLike {
  uploadFiles(file: unknown): Promise<{ error: { message: string } | null }>;
  deleteFiles(keys: string[], options: { keyType: "customId" }): Promise<unknown>;
}

/**
 * The SDK, loaded only if this driver is actually used.
 *
 * The specifier is a variable so that neither TypeScript nor the bundler tries to
 * resolve a package that an app using a different driver has no reason to install.
 */
const SDK = "uploadthing/server";

async function api(token: string | undefined): Promise<UTApiLike> {
  let module: { UTApi: new (options: Record<string, unknown>) => UTApiLike };
  try {
    module = (await import(SDK)) as never;
  } catch {
    throw new Error('STORAGE_DRIVER is "uploadthing" but the `uploadthing` package is not installed. Run: pnpm add uploadthing');
  }
  return new module.UTApi(token ? { token } : {});
}

export function uploadThingBucket(options: UploadThingOptions): StorageBucket {
  const publicDelivery = options.publicDelivery ?? true;
  const deliveryUrl = (key: string) => `https://${options.appId}.ufs.sh/f/${customIdFor(key)}`;

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
      const body = value === null ? new ArrayBuffer(0) : await new Response(value as BodyInit).arrayBuffer();
      const contentType = putOptions?.httpMetadata?.contentType;
      const name = key.split("/").pop() ?? "file";

      // UTApi takes a Blob with a `name`, and reads `customId` off it. A global `File`
      // is exactly that on Node 20+, which is the floor Flare builds on anyway.
      const file = new File([body], name, contentType ? { type: contentType } : undefined) as File & { customId?: string };
      file.customId = customIdFor(key);

      const { error } = await (await api(options.token)).uploadFiles(file);
      if (error) throw new Error(`UploadThing upload failed for "${key}": ${error.message}`);
    },

    async delete(keys) {
      const ids = [keys].flat().map(customIdFor);
      if (ids.length === 0) return;
      // Deleting what was never there is not an error, which is the outcome asked for.
      await (await api(options.token)).deleteFiles(ids, { keyType: "customId" });
    },

    publicUrl: publicDelivery ? (key: string) => deliveryUrl(key) : undefined,
  };
}
