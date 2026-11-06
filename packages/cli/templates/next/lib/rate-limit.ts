// This file is yours.
//
// Flare copies the code that turns a resource descriptor into a working endpoint into
// your app rather than hiding it in node_modules, for the same reason shadcn/ui copies
// a component: you cannot fix, read or reason about what you cannot see.
//
// `flare diff` shows how your copy differs from the version Flare ships, and
// `flare update` applies the parts you choose. Neither runs unless you ask.

/**
 * Where a resource's rate limits are counted — the Next.js half.
 *
 * A descriptor says `rateLimit: { create: "10/min" }`; the generated route asks here
 * whether this call is within it. The counter is Redis: `INCR` then `EXPIRE` on the first
 * call of a window, which is two round trips at most and exact across every instance —
 * the reason lib/redis.ts exists.
 *
 * **If Redis is not configured, nothing is limited.** Say so loudly once rather than
 * failing every request: a serverless function that refuses to serve is worse than one
 * that logs that a limit is not being enforced, and `flare doctor` reports it as a
 * problem. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 */
import { fixedWindow, rateLimitKey, type Rate, type RateLimitDecision } from "@flaredev/core";
import { redis } from "@/lib/redis";

/** Allowed, with no count kept — what an unconfigured limiter answers. */
const UNLIMITED: RateLimitDecision = { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfter: 0 };

let warned = false;

/**
 * Count one call and say whether it was within the limit.
 *
 * `caller` is the signed-in account's id where there is one and the client IP otherwise,
 * so a limit is per person rather than per everyone behind one connection.
 */
export async function checkRateLimit(
  resource: string,
  action: string,
  caller: string,
  rate: Rate,
): Promise<RateLimitDecision> {
  if (!redis) {
    if (!warned) {
      warned = true;
      console.warn(
        "[flare] A resource declares a rateLimit, but Upstash Redis is not configured, so nothing is being limited. " +
          "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (flare doctor will show you).",
      );
    }
    return UNLIMITED;
  }

  const key = `flare:rate:${rateLimitKey(resource, action, caller)}`;
  try {
    return await fixedWindow(rate, async (windowSeconds) => {
      const count = await redis.incr(key);
      // Only the call that opened the window sets the expiry, so a busy key's window is
      // not pushed forward on every hit — that would make the limit unbounded.
      if (count === 1) {
        await redis.expire(key, windowSeconds);
        return { count, ttl: windowSeconds };
      }
      const ttl = await redis.ttl(key);
      // A key with no expiry (a crash between INCR and EXPIRE) would otherwise count for
      // ever; give it one and treat this window as full-length.
      if (ttl < 0) {
        await redis.expire(key, windowSeconds);
        return { count, ttl: windowSeconds };
      }
      return { count, ttl };
    });
  } catch (error) {
    // A counter that is unreachable must not take the endpoint down with it. Letting the
    // call through is the safer failure: the alternative is an outage in the limiter
    // becoming an outage in the app.
    console.error("[flare] rate limit counter failed, allowing the request:", error);
    return UNLIMITED;
  }
}
