/**
 * The Worker layer of Flare security: runs in the app's `worker/index.ts` around
 * every request, before any app code.
 *
 * - Refuses IPs on the ban list (KV, so a ban is a cheap edge read and expires by TTL).
 * - Applies the Workers rate-limit binding to the configured paths.
 * - Feeds responses to the detectors. Counting lives in `SecurityMonitor`, one Durable
 *   Object per IP, so counts are exact rather than eventually consistent; the hit that
 *   crosses a threshold bans the IP, logs a SecurityEvent, and (with a zone configured)
 *   adds a zone IP Access Rule.
 */
import { DurableObject } from "cloudflare:workers";
import { clientIp, detectorMatches, recordHit, type Detector, type SecurityConfig, type Severity } from "./config.js";
import type { ZoneClient } from "./zone.js";

/** The KV subset Flare uses for the ban list. */
export interface BanStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{ keys: Array<{ name: string; metadata?: unknown; expiration?: number }>; list_complete: boolean; cursor?: string }>;
}

/** The Workers rate-limit binding. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The DurableObjectNamespace subset used to reach SecurityMonitor instances. */
export interface MonitorNamespace {
  idFromName(name: string): unknown;
  get(id: never): unknown;
}

export interface Ban {
  ip: string;
  reason: string;
  detector: string | null;
  createdAt: string;
  /** When the ban lifts; null for a manual ban without an expiry. */
  until: string | null;
}

export interface SecurityTrip {
  ip: string;
  detector: Detector;
  count: number;
  path: string;
  userAgent: string | null;
  banned: boolean;
}

const BAN_PREFIX = "ban:";

/** Per-IP counters. One instance per IP (idFromName(ip)), so increments are exact. */
export class SecurityMonitor extends DurableObject {
  /** Record one hit for a detector and say whether it crossed the threshold. */
  async hit(detector: string, windowSeconds: number, threshold: number): Promise<{ count: number; tripped: boolean }> {
    const key = `hits:${detector}`;
    const previous = (await this.ctx.storage.get<number[]>(key)) ?? [];
    const { hits, tripped } = recordHit(previous, Date.now(), windowSeconds, threshold);
    await this.ctx.storage.put(key, hits);
    return { count: hits.length, tripped };
  }

  /** Count a request refused because this IP is banned. */
  async blocked(): Promise<number> {
    const count = ((await this.ctx.storage.get<number>("blocked")) ?? 0) + 1;
    await this.ctx.storage.put("blocked", count);
    return count;
  }

  /** Requests refused since the IP was banned. */
  async blockedCount(): Promise<number> {
    return (await this.ctx.storage.get<number>("blocked")) ?? 0;
  }

  /** Forget this IP's counters (on unban). */
  async reset(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

type Monitor = Pick<SecurityMonitor, "hit" | "blocked" | "blockedCount" | "reset">;

export interface GuardOptions {
  config: SecurityConfig;
  bans: BanStore;
  monitors: MonitorNamespace;
  rateLimiter?: RateLimiter;
  /** The zone layer, when this app has a zone and token configured. */
  zone?: ZoneClient | null;
  /** Log a tripped detector (the app writes a SecurityEvent row). */
  onTrip?: (trip: SecurityTrip) => Promise<void>;
}

export interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

export function createSecurity(options: GuardOptions) {
  const { config, bans } = options;
  const allowed = new Set(config.allow ?? []);
  const monitor = (ip: string) => options.monitors.get(options.monitors.idFromName(ip) as never) as Monitor;
  const detectors = config.detectors ?? [];
  // KV takes a few seconds to show a new key at the edge (and caches the earlier miss),
  // so this isolate also remembers its own bans briefly and refuses the rest of a burst at once.
  const recentBans = new Map<string, number>();
  const RECENT_MS = 60_000;

  async function ban(ip: string, reason: string, seconds: number | null, detector: string | null): Promise<Ban> {
    const record: Ban = {
      ip,
      reason,
      detector,
      createdAt: new Date().toISOString(),
      until: seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null,
    };
    await bans.put(`${BAN_PREFIX}${ip}`, JSON.stringify(record), { ...(seconds ? { expirationTtl: seconds } : {}), metadata: record });
    recentBans.set(ip, Date.now() + Math.min((seconds ?? Infinity) * 1000, RECENT_MS));
    if (options.zone) await options.zone.ban(ip, reason);
    return record;
  }

  async function unban(ip: string): Promise<void> {
    await bans.delete(`${BAN_PREFIX}${ip}`);
    recentBans.delete(ip);
    await monitor(ip).reset();
    if (options.zone) await options.zone.unban(ip);
  }

  /** Active Worker-layer bans, with how many requests each has blocked. */
  async function listBans(): Promise<Array<Ban & { blocked: number }>> {
    const found: Ban[] = [];
    let cursor: string | undefined;
    do {
      const page = await bans.list({ prefix: BAN_PREFIX, cursor });
      for (const key of page.keys) if (key.metadata) found.push(key.metadata as Ban);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return Promise.all(found.map(async (entry) => ({ ...entry, blocked: await monitor(entry.ip).blockedCount() })));
  }

  async function inspect(request: Request, response: Response, ip: string) {
    for (const detector of detectors) {
      if (!detectorMatches(detector, request, response.status)) continue;
      const { count, tripped } = await monitor(ip).hit(detector.name, detector.windowSeconds, detector.threshold);
      if (!tripped) continue;
      const reason = `${detector.description ?? detector.name}: ${count} in ${detector.windowSeconds}s`;
      if (detector.ban) {
        // A zone API failure must not lose the event: the Worker-layer ban is already in KV by then.
        await ban(ip, reason, detector.ban.seconds, detector.name).catch((error) => console.error("[flare] zone ban failed:", error));
      }
      await options.onTrip?.({
        ip,
        detector,
        count,
        path: new URL(request.url).pathname,
        userAgent: request.headers.get("user-agent"),
        banned: Boolean(detector.ban),
      });
    }
  }

  /**
   * Run `next` (the app) behind the ban list, the rate limit and the detectors. Detector
   * bookkeeping runs after the response, in waitUntil, so it never slows the request.
   */
  async function protect(request: Request, ctx: WaitUntil, next: () => Promise<Response>): Promise<Response> {
    const ip = clientIp(request);
    if (!ip || allowed.has(ip)) return next();

    const remembered = recentBans.get(ip);
    if (remembered !== undefined && remembered <= Date.now()) recentBans.delete(ip);
    if ((remembered !== undefined && remembered > Date.now()) || (await bans.get(`${BAN_PREFIX}${ip}`))) {
      ctx.waitUntil(monitor(ip).blocked());
      return new Response("Access denied.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    }

    if (options.rateLimiter && config.rateLimit?.paths.test(new URL(request.url).pathname)) {
      const { success } = await options.rateLimiter.limit({ key: ip });
      if (!success) {
        return new Response("Too many requests. Slow down and try again shortly.", {
          status: 429,
          headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "60", "cache-control": "no-store" },
        });
      }
    }

    const response = await next();
    if (detectors.length) ctx.waitUntil(inspect(request, response, ip).catch((error) => console.error("[flare] security detector failed:", error)));
    return response;
  }

  return { protect, ban, unban, bans: listBans };
}

export type Security = ReturnType<typeof createSecurity>;
export type { Detector, SecurityConfig, Severity };
