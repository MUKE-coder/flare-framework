import { cached, TTL } from "@/lib/cache";
import { storage } from "@/lib/storage";

/**
 * How much this app has put in R2.
 *
 * Listing a bucket is a Class A operation — the expensive kind — so it is cached for an
 * hour. A bucket with more objects than one listing returns is reported as far as the
 * cap and no further, because walking a million keys to draw one number would cost more
 * than the number is worth.
 */
const MAX_KEYS = 1_000;

export const storedBytes = cached(
  async (): Promise<{ files: number; bytes: number; capped: boolean }> => {
    try {
      if (!storage.bucket.list) return { files: 0, bytes: 0, capped: false };
      const listed = await storage.bucket.list({ limit: MAX_KEYS });
      const objects = listed.objects ?? [];
      return {
        files: objects.length,
        bytes: objects.reduce((sum, object) => sum + (object.size ?? 0), 0),
        capped: Boolean(listed.truncated),
      };
    } catch {
      // No bucket bound, or no permission to list it: report nothing rather than fail.
      return { files: 0, bytes: 0, capped: false };
    }
  },
  ["flare", "stored-bytes"],
  { revalidate: TTL.long },
);
