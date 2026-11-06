/**
 * The Cloudflare half of rate limiting: a Durable Object that holds the counters.
 *
 * **One instance per resource and action, not per caller.** A Durable Object is a billed
 * request, so a counter per signed-in user per endpoint would be an invoice rather than a
 * feature. Instead one object holds a map of caller → count for a single
 * resource-and-action pair, which is one request per limited call and a handful of
 * objects for the whole app.
 *
 * **Counters live in memory.** If the object is evicted the window restarts, which lets a
 * caller through earlier than the limit says. That is the right trade here: this is for
 * stopping one account hammering one endpoint, and the alternative is a storage write on
 * every request to make the boundary exact. A limit that must hold across an eviction —
 * a paid quota, say — belongs in the database with the thing it is metering.
 *
 * The alarm is what keeps memory flat: every window, whatever has expired is dropped.
 */
import { DurableObject } from "cloudflare:workers";
import { fixedWindow, type Rate, type RateLimitDecision } from "../rate-limit.js";

/** How often the object sweeps expired counters, in milliseconds. */
const SWEEP_INTERVAL = 60_000;

interface Counter {
  count: number;
  /** When this window ends, in epoch milliseconds. */
  expires: number;
}

export class RateLimitCounter extends DurableObject {
  private counters = new Map<string, Counter>();

  /**
   * Count one call against `key` and say whether it was within `rate`.
   *
   * Called through the stub, so the arguments cross a serialization boundary: plain data
   * only, which is why the rate is passed in rather than configured on the object.
   */
  async hit(key: string, rate: Rate): Promise<RateLimitDecision> {
    const decision = await fixedWindow(rate, async (windowSeconds) => {
      const now = Date.now();
      const existing = this.counters.get(key);
      if (!existing || existing.expires <= now) {
        const counter = { count: 1, expires: now + windowSeconds * 1000 };
        this.counters.set(key, counter);
        return { count: 1, ttl: windowSeconds };
      }
      existing.count += 1;
      return { count: existing.count, ttl: (existing.expires - now) / 1000 };
    });

    // Scheduled lazily: an object that is never used again never wakes up.
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_INTERVAL);
    return decision;
  }

  /** Drop what has expired, and keep sweeping only while something is left. */
  async alarm(): Promise<void> {
    const now = Date.now();
    for (const [key, counter] of this.counters) {
      if (counter.expires <= now) this.counters.delete(key);
    }
    if (this.counters.size > 0) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL);
  }
}

/** What the generated `AppEnv` calls this binding. */
export const RATE_LIMIT_BINDING = "FLARE_RATE_LIMIT";

/** The shape of the binding, so an app can type it without importing the Workers types. */
export interface RateLimitNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { hit(key: string, rate: Rate): Promise<RateLimitDecision> };
}
