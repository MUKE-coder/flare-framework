/**
 * Rate limiting per resource and per action.
 *
 * A descriptor says how often each action may be called:
 *
 * ```ts
 * rateLimit: { create: "10/min", "*": "120/min" }
 * ```
 *
 * and the generated route enforces it before the store is touched. The point is the
 * actions that cost something — a create that sends an email, an export that reads the
 * whole table — not a blanket limit on everything, which is what the edge already does.
 *
 * **Why not the platform's own limiter.** Cloudflare has a rate-limiting binding and it
 * is cheaper than anything here, but its window may only be 10 or 60 seconds and its
 * limit is fixed in the Worker's configuration rather than per call. A descriptor that
 * said `"500/hour"` would work on one stack and not the other, and a descriptor that
 * behaves differently per stack is the one thing Flare does not do. So the counter is
 * Flare's: a Durable Object on Cloudflare, Redis on Next.js, the same arithmetic on both.
 *
 * The edge limiter is still worth having and is unaffected — `flare gen security`
 * configures it. It stops floods; this stops one signed-in account from calling one
 * endpoint too often, which is a different question.
 */

/** Windows a limit may be written in, and what they are in seconds. */
const WINDOWS: Record<string, number> = {
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hour: 3600,
  hours: 3600,
  d: 86_400,
  day: 86_400,
  days: 86_400,
};

/** A limit, once parsed: so many calls per so many seconds. */
export interface Rate {
  limit: number;
  seconds: number;
}

export class RateSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateSyntaxError";
  }
}

/**
 * `"10/min"` → `{ limit: 10, seconds: 60 }`.
 *
 * Also takes a count, as in `"30/5min"`, for the windows between the named ones. Throws
 * rather than guessing: a rate limit that silently parsed as something else is worse than
 * one that refuses to generate.
 */
export function parseRate(spec: string): Rate {
  const match = /^\s*(\d+)\s*\/\s*(\d*)\s*([a-z]+)\s*$/i.exec(spec);
  if (!match) {
    throw new RateSyntaxError(`"${spec}" is not a rate. Write it as calls/window, e.g. "10/min", "5/s" or "30/5min".`);
  }
  const limit = Number(match[1]);
  const count = match[2] === "" ? 1 : Number(match[2]);
  const unit = WINDOWS[match[3]!.toLowerCase()];
  if (unit === undefined) {
    throw new RateSyntaxError(`"${spec}" uses an unknown window "${match[3]}". Use s, min, hour or day.`);
  }
  if (limit < 1) throw new RateSyntaxError(`"${spec}" allows no calls at all. To forbid an action, use a policy instead of a rate limit.`);
  if (count < 1) throw new RateSyntaxError(`"${spec}" has a window of zero.`);
  return { limit, seconds: count * unit };
}

/** Actions a rate limit can be set on, plus `*` for the rest. */
export type RateLimitedAction = "list" | "read" | "create" | "update" | "delete" | "*";

/** What a descriptor may say about how often it can be called. */
export type RateLimitConfig = Partial<Record<RateLimitedAction, string>>;

/**
 * The rate that applies to one action, or undefined when none does.
 *
 * The named action wins over `*`, so `{ create: "10/min", "*": "120/min" }` reads as "ten
 * creates a minute, a hundred and twenty of anything else" rather than both at once.
 */
export function rateFor(config: RateLimitConfig | undefined, action: RateLimitedAction): Rate | undefined {
  if (!config) return undefined;
  const spec = config[action] ?? config["*"];
  return spec === undefined ? undefined : parseRate(spec);
}

/** Every rate a config declares, by action, with its spec — for validation and for docs. */
export function ratesIn(config: RateLimitConfig | undefined): { action: RateLimitedAction; spec: string; rate: Rate }[] {
  if (!config) return [];
  return Object.entries(config)
    .filter(([, spec]) => typeof spec === "string")
    .map(([action, spec]) => ({ action: action as RateLimitedAction, spec: spec as string, rate: parseRate(spec as string) }));
}

/** What a counter says when it is asked. */
export interface RateLimitDecision {
  allowed: boolean;
  /** Calls left in this window, never below zero. */
  remaining: number;
  /** Seconds until the window resets — what goes in `Retry-After`. */
  retryAfter: number;
}

/**
 * Somewhere to keep the counters.
 *
 * One method, because that is all a fixed window needs: count this call, and say whether
 * it was within the limit. Implemented over a Durable Object on Cloudflare and over Redis
 * on Next.js; both are in the app, in `lib/rate-limit.ts`, and both are yours to replace.
 */
export interface RateLimitStore {
  hit(key: string, rate: Rate): Promise<RateLimitDecision>;
}

/**
 * The key a limit is counted against: one bucket per resource, action and caller.
 *
 * The caller is the signed-in account where there is one and the IP otherwise, so a limit
 * on `create` is a limit on that person rather than on everyone sharing an office
 * connection. Anonymous callers behind one address do share a bucket, which is the right
 * trade for an endpoint that does not know who is calling.
 */
export const rateLimitKey = (resource: string, action: string, caller: string) => `${resource}:${action}:${caller}`;

/**
 * A fixed-window count, given somewhere to keep a number.
 *
 * Shared by both backends so the arithmetic — and the off-by-one at the boundary — is
 * written once. `increment` returns the count *after* this call and the seconds left in
 * the window it belongs to.
 */
export async function fixedWindow(
  rate: Rate,
  increment: (windowSeconds: number) => Promise<{ count: number; ttl: number }>,
): Promise<RateLimitDecision> {
  const { count, ttl } = await increment(rate.seconds);
  const remaining = Math.max(0, rate.limit - count);
  // `count` includes this call, so the limit is reached when count equals it, not after.
  return { allowed: count <= rate.limit, remaining, retryAfter: Math.max(1, Math.ceil(ttl)) };
}
