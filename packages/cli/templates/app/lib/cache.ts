import { revalidateTag, unstable_cache } from "next/cache";
import type { ChangeEvent } from "@flare/core/server";

/**
 * Caching for data you read far more often than you write.
 *
 * Two layers are configured in `vite.config.ts` and both are Cloudflare-native:
 *
 * - **Data cache** (Workers KV) — what `cached()` below, `fetch()` and
 *   `"use cache"` write to. Shared by every colo and every isolate, so a value
 *   computed once is reused until it expires or its tag is revalidated.
 * - **CDN cache** (Workers Cache) — whole page responses, for routes that don't
 *   read cookies or headers. Pages behind auth opt out of it automatically.
 *
 * Nothing here caches per-user data: everything keyed by session belongs
 * outside the cache, since these entries are shared between visitors.
 */

/** How long cached values stay fresh, in seconds. Pick the one that matches how stale you can stand. */
export const TTL = {
  /** Changes often, cheap to recompute: counts, dashboards. */
  short: 60,
  /** The usual case: lists and detail views behind a resource tag. */
  medium: 5 * 60,
  /** Rarely changes: settings, published content, reference tables. */
  long: 60 * 60,
} as const;

/** Tag for everything derived from a resource, e.g. `resource/Deal`. */
export const resourceTag = (resource: string) => `resource/${resource}`;

/** Tag for one record, e.g. `resource/Deal/0f9…`. */
export const recordTag = (resource: string, id: string) => `resource/${resource}/${id}`;

/**
 * The KV data cache silently ignores tags containing `:`, `\` or control
 * characters — the entry is stored untagged, so no revalidation ever reaches
 * it. Refuse them here instead, where the mistake is still visible.
 */
function checkTag(tag: string): string {
  if (!tag || tag.length > 256 || /[\x00-\x1f\\:]/.test(tag)) {
    throw new Error(`Cache tag "${tag}" can't be used: tags must be 1–256 characters without ":", "\\" or control characters.`);
  }
  return tag;
}

/**
 * Cache the result of an async function in the data cache.
 *
 * `keyParts` identify the value (include every argument the result depends on);
 * `tags` say what invalidates it. Cached functions must not read cookies,
 * headers, or anything else request-specific — the value is shared.
 *
 * ```ts
 * const openDeals = cached(
 *   () => getDb().select({ total: count() }).from(deals).where(eq(deals.stage, "open")),
 *   ["deals", "open-count"],
 *   { tags: [resourceTag("Deal")] },
 * );
 * ```
 */
export function cached<Args extends unknown[], Value>(
  fn: (...args: Args) => Promise<Value>,
  keyParts: string[],
  options: { tags?: string[]; revalidate?: number } = {},
) {
  return unstable_cache(fn, keyParts, {
    revalidate: options.revalidate ?? TTL.medium,
    tags: (options.tags ?? []).map(checkTag),
  });
}

/**
 * Drop everything cached for a resource (and for the record that changed).
 * `lib/admin.ts` and `lib/api.ts` pass this to the store, so writes through the
 * admin or the REST API invalidate without anyone remembering to call it.
 */
export function revalidateResource({ resource, action, id }: ChangeEvent) {
  // { expire: 0 }: drop the entry now rather than serving it stale while it refreshes.
  // A record someone just edited should never come back with its old values.
  revalidateTag(resourceTag(resource), { expire: 0 });
  if (action !== "create") revalidateTag(recordTag(resource, id), { expire: 0 });
}
