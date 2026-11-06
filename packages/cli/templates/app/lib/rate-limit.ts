// This file is yours.
//
// Flare copies the code that turns a resource descriptor into a working endpoint into
// your app rather than hiding it in node_modules, for the same reason shadcn/ui copies
// a component: you cannot fix, read or reason about what you cannot see.
//
// `flare diff` shows how your copy differs from the version Flare ships, and
// `flare update` applies the parts you choose. Neither runs unless you ask.

/**
 * Where a resource's rate limits are counted — the Cloudflare half.
 *
 * A descriptor says `rateLimit: { create: "10/min" }`; the generated route asks here
 * whether this call is within it. The counters live in a Durable Object, one instance per
 * resource and action holding a map of caller → count, so a limited call costs one object
 * request rather than one per caller.
 *
 * **If the binding is missing, nothing is limited.** Say so loudly once rather than
 * failing every request: an app that will not serve anything is worse than one that logs
 * that a limit is not being enforced, and `flare doctor` reports it as a problem. The
 * binding is in wrangler.jsonc as FLARE_RATE_LIMIT.
 */
import { env } from "cloudflare:workers";
import { rateLimitKey, type Rate, type RateLimitDecision } from "@flaredev/core";
import type { RateLimitNamespace } from "@flaredev/core/rate-limit/server";

/** Allowed, with no count kept — what an unconfigured limiter answers. */
const UNLIMITED: RateLimitDecision = { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfter: 0 };

let warned = false;

/** The FLARE_RATE_LIMIT binding, or undefined when the app has none. */
function namespace(): RateLimitNamespace | undefined {
  const binding = (env as { FLARE_RATE_LIMIT?: RateLimitNamespace } | undefined)?.FLARE_RATE_LIMIT;
  if (binding) return binding;
  if (!warned) {
    warned = true;
    console.warn(
      "[flare] A resource declares a rateLimit, but there is no FLARE_RATE_LIMIT binding, so nothing is being limited. " +
        "Add it to wrangler.jsonc (flare doctor will show you).",
    );
  }
  return undefined;
}

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
  const binding = namespace();
  if (!binding) return UNLIMITED;
  try {
    // One object per resource and action; the caller is a key inside it.
    const stub = binding.get(binding.idFromName(`${resource}:${action}`));
    return await stub.hit(rateLimitKey(resource, action, caller), rate);
  } catch (error) {
    // A counter that is unreachable must not take the endpoint down with it. Letting the
    // call through is the safer failure: the alternative is an outage in the limiter
    // becoming an outage in the app.
    console.error("[flare] rate limit counter failed, allowing the request:", error);
    return UNLIMITED;
  }
}
