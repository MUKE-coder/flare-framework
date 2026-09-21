/**
 * Flare security: what an app's `security.config.ts` declares, and the pure rules
 * that apply it. Nothing here touches Cloudflare or storage, so it is unit-tested.
 *
 * Two layers enforce the config:
 *
 * - **Worker layer** (always on, any plan, works on workers.dev): before the app runs,
 *   the Worker refuses banned IPs and applies the Workers rate-limit binding; after it
 *   runs, detectors count matching responses per IP and ban an IP that trips one.
 * - **Zone layer** (optional): when the app has a zone and a scoped API token, the same
 *   bans become zone IP Access Rules and `flare deploy` provisions the zone's WAF
 *   custom rules and rate-limiting rules. Flare only ever touches rules it tagged.
 */

export type Severity = "low" | "medium" | "high";

/** A pattern of responses that signals abuse when one IP produces too many of them. */
export interface Detector {
  /** Stable id, e.g. "login-brute-force". Used as the SecurityEvent kind. */
  name: string;
  /** Human description for the dashboard. */
  description?: string;
  match: {
    /** HTTP method, e.g. "POST". Any method when omitted. */
    method?: string;
    /** Exact path ("/api/auth/sign-in/email") or a RegExp. */
    path: string | RegExp;
    /** Response statuses that count, e.g. [401]. Any status when omitted. */
    status?: number | number[];
  };
  /** How many matches within `windowSeconds` trip the detector. */
  threshold: number;
  windowSeconds: number;
  /** Ban the IP when tripped. Omit to only log a SecurityEvent. */
  ban?: { seconds: number };
  severity?: Severity;
}

/** A zone rate-limiting rule (Cloudflare's http_ratelimit phase). */
export interface ZoneRateLimit {
  name: string;
  /** Cloudflare rules-language expression, e.g. `http.request.uri.path eq "/api/auth/sign-in/email"`. */
  expression: string;
  /** Requests allowed per `periodSeconds` per IP before blocking. */
  requests: number;
  /** 10 on the Free plan; 60, 120, 300, 600, 3600 on paid plans. */
  periodSeconds: number;
  /** How long to block once the limit is hit. 10 on the Free plan. */
  mitigationSeconds: number;
}

/** A zone WAF custom rule (Cloudflare's http_request_firewall_custom phase). */
export interface ZoneCustomRule {
  name: string;
  expression: string;
  action: "block" | "managed_challenge" | "js_challenge" | "log";
}

export interface SecurityConfig {
  /** IPs that are never banned or rate-limited (your office, uptime monitors). */
  allow?: string[];
  /** Response patterns that indicate abuse. */
  detectors?: Detector[];
  /**
   * Worker-level rate limit through the Workers rate-limit binding. Its limit and
   * period are set on the binding in wrangler.jsonc; this chooses which paths use it.
   */
  rateLimit?: { binding: string; paths: RegExp };
  /** Zone rules `flare deploy` provisions when a zone and token are configured. */
  zone?: { rateLimits?: ZoneRateLimit[]; customRules?: ZoneCustomRule[] };
}

const NAME = /^[a-z][a-z0-9-]{1,47}$/;

/** Validate and return a security config (the value `security.config.ts` default-exports). */
export function defineSecurity(config: SecurityConfig): SecurityConfig {
  const seen = new Set<string>();
  for (const detector of config.detectors ?? []) {
    if (!NAME.test(detector.name)) throw new Error(`Detector name "${detector.name}" must be lowercase letters, digits and dashes.`);
    if (seen.has(detector.name)) throw new Error(`Detector "${detector.name}" is defined twice.`);
    seen.add(detector.name);
    if (!(detector.threshold >= 1) || !(detector.windowSeconds >= 1)) {
      throw new Error(`Detector "${detector.name}" needs a threshold and windowSeconds of at least 1.`);
    }
    if (detector.ban && !(detector.ban.seconds >= 60)) throw new Error(`Detector "${detector.name}" must ban for at least 60 seconds.`);
  }
  for (const rule of [...(config.zone?.rateLimits ?? []), ...(config.zone?.customRules ?? [])]) {
    if (!NAME.test(rule.name)) throw new Error(`Zone rule name "${rule.name}" must be lowercase letters, digits and dashes.`);
    if (!rule.expression.trim()) throw new Error(`Zone rule "${rule.name}" needs an expression.`);
  }
  for (const ip of config.allow ?? []) {
    if (!isIp(ip)) throw new Error(`allow: "${ip}" is not an IP address.`);
  }
  return config;
}

/** Whether a response to this request counts for the detector. */
export function detectorMatches(detector: Detector, request: { method: string; url: string }, status: number): boolean {
  const { method, path, status: statuses } = detector.match;
  if (method && method.toUpperCase() !== request.method.toUpperCase()) return false;
  const pathname = new URL(request.url).pathname;
  if (typeof path === "string" ? pathname !== path : !path.test(pathname)) return false;
  if (statuses === undefined) return true;
  return (Array.isArray(statuses) ? statuses : [statuses]).includes(status);
}

/**
 * Sliding-window count: keep the hits still inside the window, add this one, and
 * say whether it reaches the threshold. `tripped` is true only on the hit that
 * crosses it, so one burst produces one event and one ban, not one per request.
 */
export function recordHit(previous: number[], now: number, windowSeconds: number, threshold: number): { hits: number[]; tripped: boolean } {
  const since = now - windowSeconds * 1000;
  const hits = [...previous.filter((at) => at > since), now];
  return { hits, tripped: hits.length === threshold };
}

/**
 * The client's IP. On Cloudflare, CF-Connecting-IP is set by the edge and can't be
 * forged by the client; anything else (X-Forwarded-For) could be, so it's ignored.
 */
export function clientIp(request: Request): string | null {
  const ip = request.headers.get("cf-connecting-ip")?.trim();
  return ip && isIp(ip) ? ip : null;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
/** IPv4, or an IPv6 address in any of its textual forms. */
export function isIp(value: string): boolean {
  if (IPV4.test(value)) return true;
  if (!/^[0-9a-f:.]+$/i.test(value) || !value.includes(":")) return false;
  try {
    new URL(`http://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

/** Tag Flare writes on every zone rule it owns, so re-provisioning never touches anyone else's. */
export const zoneRuleTag = (app: string, name: string) => `flare:${app}:${name}`;
export const isFlareRule = (app: string, description: string | undefined | null) => Boolean(description?.startsWith(`flare:${app}:`));

/** The default detectors every app starts with. */
export const DEFAULT_DETECTORS: Detector[] = [
  {
    name: "login-brute-force",
    description: "Repeated failed sign-ins from one IP",
    match: { method: "POST", path: "/api/auth/sign-in/email", status: [401, 403] },
    threshold: 5,
    windowSeconds: 60,
    ban: { seconds: 60 * 60 },
    severity: "high",
  },
  {
    name: "checkout-abuse",
    description: "Many checkout attempts from one IP",
    match: { method: "POST", path: /^\/api\/billing\/checkout$/ },
    threshold: 10,
    windowSeconds: 60,
    ban: { seconds: 30 * 60 },
    severity: "medium",
  },
  {
    name: "api-scraping",
    description: "Rapid reads across the REST API from one IP",
    match: { method: "GET", path: /^\/api\/(?!auth\/|health$)/ },
    threshold: 300,
    windowSeconds: 60,
    severity: "low",
  },
];
