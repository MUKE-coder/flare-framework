import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DETECTORS,
  clientIp,
  createZoneClient,
  defineSecurity,
  detectorMatches,
  isIp,
  recordHit,
  type Detector,
} from "../src/security/index.js";
import { createSecurity, SecurityMonitor, type BanStore } from "../src/security/worker.js";

const loginDetector: Detector = {
  name: "login-brute-force",
  match: { method: "POST", path: "/api/auth/sign-in/email", status: [401] },
  threshold: 3,
  windowSeconds: 60,
  ban: { seconds: 3600 },
};

describe("security config", () => {
  it("validates detectors, zone rules and the allow list", () => {
    expect(() => defineSecurity({ detectors: [loginDetector] })).not.toThrow();
    expect(() => defineSecurity({ detectors: [{ ...loginDetector, name: "Bad Name" }] })).toThrow(/lowercase/);
    expect(() => defineSecurity({ detectors: [loginDetector, loginDetector] })).toThrow(/twice/);
    expect(() => defineSecurity({ detectors: [{ ...loginDetector, ban: { seconds: 5 } }] })).toThrow(/at least 60/);
    expect(() => defineSecurity({ allow: ["not-an-ip"] })).toThrow(/not an IP/);
    expect(() => defineSecurity({ zone: { customRules: [{ name: "x1", expression: " ", action: "block" }] } })).toThrow(/expression/);
    expect(() => defineSecurity({ detectors: DEFAULT_DETECTORS })).not.toThrow();
  });

  it("matches detectors on method, path and status", () => {
    const post = (path: string) => ({ method: "POST", url: `https://app.test${path}` });
    expect(detectorMatches(loginDetector, post("/api/auth/sign-in/email"), 401)).toBe(true);
    expect(detectorMatches(loginDetector, post("/api/auth/sign-in/email"), 200)).toBe(false);
    expect(detectorMatches(loginDetector, { method: "GET", url: "https://app.test/api/auth/sign-in/email" }, 401)).toBe(false);
    expect(detectorMatches(loginDetector, post("/api/auth/sign-up/email"), 401)).toBe(false);
    const scraping = DEFAULT_DETECTORS.find((detector) => detector.name === "api-scraping")!;
    expect(detectorMatches(scraping, { method: "GET", url: "https://app.test/api/deals?page=2" }, 200)).toBe(true);
    expect(detectorMatches(scraping, { method: "GET", url: "https://app.test/api/auth/session" }, 200)).toBe(false);
  });

  it("counts a sliding window and trips exactly once per burst", () => {
    let hits: number[] = [];
    const trips: boolean[] = [];
    for (const at of [0, 1_000, 2_000, 3_000]) {
      const result = recordHit(hits, at, 60, 3);
      hits = result.hits;
      trips.push(result.tripped);
    }
    expect(trips).toEqual([false, false, true, false]);
    // Hits older than the window fall away.
    expect(recordHit([0, 1_000], 70_000, 60, 3).hits).toEqual([70_000]);
  });

  it("reads the client IP only from CF-Connecting-IP", () => {
    const request = (headers: Record<string, string>) => new Request("https://app.test/", { headers });
    expect(clientIp(request({ "cf-connecting-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(request({ "cf-connecting-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(request({ "x-forwarded-for": "203.0.113.7" }))).toBeNull();
    expect(clientIp(request({ "cf-connecting-ip": "evil<script>" }))).toBeNull();
    expect(isIp("256.1.1.1")).toBe(false);
  });
});

/** In-memory KV with metadata and TTL bookkeeping. */
function memoryKv(): BanStore & { entries: Map<string, { value: string; metadata?: unknown; ttl?: number }> } {
  const entries = new Map<string, { value: string; metadata?: unknown; ttl?: number }>();
  return {
    entries,
    async get(key) {
      return entries.get(key)?.value ?? null;
    },
    async put(key, value, options) {
      entries.set(key, { value, metadata: options?.metadata, ttl: options?.expirationTtl });
    },
    async delete(key) {
      entries.delete(key);
    },
    async list({ prefix }) {
      return { keys: [...entries].filter(([key]) => key.startsWith(prefix)).map(([name, entry]) => ({ name, metadata: entry.metadata })), list_complete: true };
    },
  };
}

/** One real SecurityMonitor per IP, over in-memory storage. */
function monitors() {
  const instances = new Map<string, SecurityMonitor>();
  return {
    idFromName: (name: string) => name,
    get(id: never) {
      const name = id as unknown as string;
      if (!instances.has(name)) {
        const store = new Map<string, unknown>();
        const storage = {
          get: async (key: string) => store.get(key),
          put: async (key: string, value: unknown) => void store.set(key, value),
          delete: async (key: string) => store.delete(key),
          deleteAll: async () => store.clear(),
          list: async () => new Map(),
        };
        instances.set(name, new (SecurityMonitor as unknown as new (ctx: unknown, env: unknown) => SecurityMonitor)({ storage }, {}));
      }
      return instances.get(name)!;
    },
  };
}

function waitUntil() {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: (promise: Promise<unknown>) => void pending.push(promise), settle: () => Promise.all(pending.splice(0)) };
}

const signIn = (ip: string) =>
  new Request("https://app.test/api/auth/sign-in/email", { method: "POST", headers: { "cf-connecting-ip": ip, "user-agent": "probe" } });

describe("Worker-layer security", () => {
  it("bans an IP that trips a detector, refuses it afterwards, and logs one event", async () => {
    const bans = memoryKv();
    const onTrip = vi.fn(async () => {});
    const security = createSecurity({ config: { detectors: [loginDetector] }, bans, monitors: monitors(), onTrip });
    const ctx = waitUntil();
    const failedLogin = async () => new Response("no", { status: 401 });

    for (let i = 0; i < 3; i++) {
      expect((await security.protect(signIn("203.0.113.7"), ctx, failedLogin)).status).toBe(401);
      await ctx.settle();
    }
    expect(onTrip).toHaveBeenCalledTimes(1);
    expect(onTrip).toHaveBeenCalledWith(expect.objectContaining({ ip: "203.0.113.7", count: 3, banned: true, path: "/api/auth/sign-in/email", userAgent: "probe" }));
    expect(bans.entries.get("ban:203.0.113.7")).toMatchObject({ ttl: 3600, metadata: { ip: "203.0.113.7", detector: "login-brute-force" } });

    const app = vi.fn(async () => new Response("ok"));
    const refused = await security.protect(signIn("203.0.113.7"), ctx, app);
    await ctx.settle();
    expect(refused.status).toBe(403);
    expect(app).not.toHaveBeenCalled();
    // Other IPs are unaffected, and the dashboard can see how much the ban blocked.
    expect((await security.protect(signIn("198.51.100.2"), ctx, app)).status).toBe(200);
    expect(await security.bans()).toEqual([expect.objectContaining({ ip: "203.0.113.7", blocked: 1 })]);
  });

  it("refuses the rest of a burst while KV still serves the earlier miss", async () => {
    const bans = memoryKv();
    const stale = { ...bans, get: async () => null };
    const security = createSecurity({ config: { detectors: [loginDetector] }, bans: stale, monitors: monitors() });
    const ctx = waitUntil();
    for (let i = 0; i < 3; i++) {
      await security.protect(signIn("203.0.113.7"), ctx, async () => new Response("no", { status: 401 }));
      await ctx.settle();
    }
    expect((await security.protect(signIn("203.0.113.7"), ctx, async () => new Response("ok"))).status).toBe(403);
    await security.unban("203.0.113.7");
    expect((await security.protect(signIn("203.0.113.7"), ctx, async () => new Response("ok"))).status).toBe(200);
  });

  it("never touches allow-listed IPs or requests without a client IP", async () => {
    const onTrip = vi.fn(async () => {});
    const security = createSecurity({ config: { detectors: [loginDetector], allow: ["203.0.113.7"] }, bans: memoryKv(), monitors: monitors(), onTrip });
    const ctx = waitUntil();
    for (let i = 0; i < 5; i++) await security.protect(signIn("203.0.113.7"), ctx, async () => new Response("no", { status: 401 }));
    await security.protect(new Request("https://app.test/api/auth/sign-in/email", { method: "POST" }), ctx, async () => new Response("no", { status: 401 }));
    await ctx.settle();
    expect(onTrip).not.toHaveBeenCalled();
  });

  it("applies the rate-limit binding to its paths only", async () => {
    const rateLimiter = { limit: vi.fn(async () => ({ success: false })) };
    const security = createSecurity({ config: { rateLimit: { binding: "RL", paths: /^\/api\// } }, bans: memoryKv(), monitors: monitors(), rateLimiter });
    const ctx = waitUntil();
    expect((await security.protect(signIn("203.0.113.7"), ctx, async () => new Response("ok"))).status).toBe(429);
    expect(rateLimiter.limit).toHaveBeenCalledWith({ key: "203.0.113.7" });
    const page = new Request("https://app.test/pricing", { headers: { "cf-connecting-ip": "203.0.113.7" } });
    expect((await security.protect(page, ctx, async () => new Response("ok"))).status).toBe(200);
  });

  it("manual ban and unban also reach the zone layer", async () => {
    const zone = { ban: vi.fn(async () => ({})), unban: vi.fn(async () => true) };
    const bans = memoryKv();
    const security = createSecurity({ config: {}, bans, monitors: monitors(), zone: zone as never });
    await security.ban("203.0.113.9", "Manual ban", null, null);
    expect(zone.ban).toHaveBeenCalledWith("203.0.113.9", "Manual ban");
    expect(bans.entries.get("ban:203.0.113.9")?.ttl).toBeUndefined();
    await security.unban("203.0.113.9");
    expect(zone.unban).toHaveBeenCalledWith("203.0.113.9");
    expect(await security.bans()).toEqual([]);
  });
});

describe("zone client", () => {
  function api(routes: Record<string, (init?: RequestInit) => unknown>) {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${String(url).replace("https://api.cloudflare.com/client/v4", "")}`;
      calls.push({ method: init?.method ?? "GET", url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const route = Object.keys(routes).find((pattern) => key.startsWith(pattern));
      if (!route) return new Response(JSON.stringify({ success: false, errors: [{ message: `no route ${key}` }] }), { status: 404 });
      return new Response(JSON.stringify({ success: true, result: routes[route]!(init) }));
    });
    return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
  }

  it("replaces only this app's rules in a phase, keeping the zone's own", async () => {
    const { fetch, calls } = api({
      "GET /zones/z1/rulesets/phases/http_request_firewall_custom/entrypoint": () => ({
        rules: [
          { id: "r1", action: "block", expression: "ip.src eq 1.1.1.1", description: "someone else's rule", version: "3", last_updated: "x" },
          { id: "r2", action: "block", expression: "old", description: "flare:demo:old-rule" },
          { id: "r3", action: "log", expression: "x", description: "flare:other-app:keep" },
        ],
      }),
      "PUT /zones/z1/rulesets/phases/http_request_firewall_custom/entrypoint": () => ({}),
    });
    const zone = createZoneClient({ zoneId: "z1", apiToken: "t", app: "demo", fetch });
    const result = await zone.syncCustomRules([{ name: "block-wp", expression: 'http.request.uri.path contains "/wp-login.php"', action: "block" }]);

    expect(result).toEqual({ kept: 2, written: 1 });
    const rules = (calls.at(-1)!.body as { rules: Array<{ id?: string; description: string; version?: string }> }).rules;
    expect(rules.map((rule) => rule.description)).toEqual(["someone else's rule", "flare:other-app:keep", "flare:demo:block-wp"]);
    expect(rules[0]).not.toHaveProperty("version");
    expect(rules[0]!.id).toBe("r1");
  });

  it("creates the phase when the zone has none yet", async () => {
    const { fetch, calls } = api({ "PUT /zones/z1/rulesets/phases/http_ratelimit/entrypoint": () => ({}) });
    const zone = createZoneClient({ zoneId: "z1", apiToken: "t", app: "demo", fetch });
    await zone.syncRateLimits([{ name: "login", expression: 'http.request.uri.path eq "/api/auth/sign-in/email"', requests: 5, periodSeconds: 10, mitigationSeconds: 10 }]);
    const [rule] = (calls.at(-1)!.body as { rules: Array<{ ratelimit: Record<string, unknown> }> }).rules;
    expect(rule!.ratelimit).toEqual({ characteristics: ["cf.colo.id", "ip.src"], period: 10, requests_per_period: 5, mitigation_timeout: 10 });
  });

  it("bans idempotently and only unbans its own bans", async () => {
    const existing = [
      { id: "a1", mode: "block", notes: "flare:demo:ban login-brute-force", created_on: "t", configuration: { value: "203.0.113.7" } },
      { id: "a2", mode: "block", notes: "added by hand", created_on: "t", configuration: { value: "198.51.100.1" } },
    ];
    const { fetch, calls } = api({
      "GET /zones/z1/firewall/access_rules/rules": () => existing,
      "POST /zones/z1/firewall/access_rules/rules": () => ({ id: "a3", notes: "flare:demo:ban x", created_on: "t" }),
      "DELETE /zones/z1/firewall/access_rules/rules/a1": () => ({}),
    });
    const zone = createZoneClient({ zoneId: "z1", apiToken: "t", app: "demo", fetch });

    expect((await zone.ban("203.0.113.7", "again")).id).toBe("a1");
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    await zone.ban("2001:db8::7", "new");
    expect(calls.find((call) => call.method === "POST")!.body).toMatchObject({ mode: "block", configuration: { target: "ip6", value: "2001:db8::7" } });
    expect(await zone.unban("198.51.100.1")).toBe(false);
    expect(await zone.unban("203.0.113.7")).toBe(true);
    expect((await zone.bans()).map((ban) => ban.ip)).toEqual(["203.0.113.7"]);
  });

  it("surfaces Cloudflare's error messages", async () => {
    const { fetch } = api({});
    const zone = createZoneClient({ zoneId: "z1", apiToken: "t", app: "demo", fetch });
    await expect(zone.bans()).rejects.toThrow(/no route/);
  });
});
