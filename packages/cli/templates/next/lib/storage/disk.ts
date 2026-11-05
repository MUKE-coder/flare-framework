import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { StorageBucket, StorageObjectBody } from "@flaredev/core";

/**
 * Files on the local disk, the way Laravel's `local` disk works.
 *
 * For development without Docker, and for a single-server deployment where a volume is
 * simpler than a bucket. It is not for anything that scales horizontally: two instances
 * do not share a filesystem, and the second one serves 404s for everything the first
 * one wrote.
 *
 * Bytes are served through this app's `/api/storage` route like R2's are, so a file is
 * still private and still behind whatever policy issued the URL. Nothing is published
 * by putting it here.
 */

export interface DiskOptions {
  /**
   * Where the files go, relative to the project root unless absolute.
   * Default `storage/app` — Laravel's name for the same thing.
   */
  dir?: string;
}

/**
 * The content type is kept beside the object rather than guessed from its extension.
 *
 * A key is whatever `createObjectKey` was given, and people upload files called
 * `report` and `IMG_0421`. Guessing would serve those as a download instead of showing
 * them, and would be wrong rather than merely unhelpful for anything renamed. The
 * sidecar lives in a parallel tree so it can never collide with a real key — somebody
 * does, eventually, upload a file called `photo.png.meta`.
 */
interface Meta {
  contentType?: string;
}

export function diskBucket(options: DiskOptions = {}): StorageBucket {
  const root = resolve(options.dir ?? join(process.cwd(), "storage", "app"));
  const objects = join(root, "objects");
  const metas = join(root, "meta");

  /**
   * A key as a path under `base`, confined to it.
   *
   * `createStorage` already rejects `..` and leading slashes before a key reaches a
   * bucket. This is the second lock on the same door: a bucket is a public function and
   * a path traversal here reads any file the process can.
   */
  const pathFor = (base: string, key: string, suffix = "") => {
    const full = resolve(join(base, key + suffix));
    if (full !== base && !full.startsWith(base + sep)) throw new Error(`Refusing to touch "${key}": it escapes the storage directory.`);
    return full;
  };

  const write = async (file: string, data: Buffer | string) => {
    try {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
    } catch (error) {
      // The one failure worth explaining. A serverless host gives you a read-only
      // filesystem, so this driver cannot work there at all — and `EROFS` on a path
      // nobody chose is a puzzling way to find that out, usually in production.
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
        throw new Error(
          `The disk driver cannot write to ${root} (${code}). A serverless host — Vercel, Lambda, Workers — ` +
            "has no writable filesystem that survives a request, so set STORAGE_DRIVER to r2, cloudinary or " +
            "uploadthing for anything deployed there. Disk is for local development and for a server you own.",
        );
      }
      throw error;
    }
  };

  return {
    async get(key: string): Promise<StorageObjectBody | null> {
      const file = pathFor(objects, key);
      let size: number;
      let mtimeMs: number;
      try {
        const info = await stat(file);
        if (!info.isFile()) return null;
        size = info.size;
        mtimeMs = info.mtimeMs;
      } catch {
        return null;
      }

      let meta: Meta = {};
      try {
        meta = JSON.parse(await readFile(pathFor(metas, key, ".json"), "utf8")) as Meta;
      } catch {
        // Written before the sidecar existed, or removed by hand. The object is still
        // the thing being asked for, so serve it as bytes rather than refusing.
      }

      return {
        // Node's stream, as the web stream the route writes to the response.
        body: Readable.toWeb(createReadStream(file)) as ReadableStream,
        size,
        // Strong enough for a cache: a write changes one or the other.
        httpEtag: `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`,
        httpMetadata: { contentType: meta.contentType },
      };
    },

    async put(key, value, putOptions) {
      // The route hands over a stream of known length, already capped by the field's
      // maxBytes and checked against its declared type.
      const body = value === null ? Buffer.alloc(0) : Buffer.from(await new Response(value as BodyInit).arrayBuffer());
      await write(pathFor(objects, key), body);
      const contentType = putOptions?.httpMetadata?.contentType;
      if (contentType) await write(pathFor(metas, key, ".json"), JSON.stringify({ contentType } satisfies Meta));
    },

    async delete(keys) {
      for (const key of [keys].flat()) {
        // `force` so deleting what was never there is the success it describes.
        await rm(pathFor(objects, key), { force: true });
        await rm(pathFor(metas, key, ".json"), { force: true });
      }
    },
  };
}
