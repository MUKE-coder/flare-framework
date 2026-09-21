import { DEFAULT_DETECTORS, defineSecurity } from "@flare/core/security";

/**
 * What Flare watches for and blocks. The Worker layer applies this on every request
 * (any plan, workers.dev included). The `zone` rules are pushed to your zone by
 * `flare deploy` when FLARE_SECURITY_ZONE_ID and FLARE_SECURITY_API_TOKEN are set.
 */
export default defineSecurity({
  // IPs never banned or rate-limited: your office, uptime monitors.
  allow: [],

  // Failed-login bursts, checkout abuse and API scraping. Each trip is logged as a
  // SecurityEvent; detectors with `ban` also block the IP.
  detectors: DEFAULT_DETECTORS,

  // Worker-level rate limit for the API (limit and period are set on the
  // FLARE_RATE_LIMIT binding in wrangler.jsonc).
  rateLimit: { binding: "FLARE_RATE_LIMIT", paths: /^\/api\// },

  zone: {
    // The Free plan allows one rate-limiting rule, with a 10-second period.
    rateLimits: [
      {
        name: "sign-in",
        expression: 'http.request.uri.path eq "/api/auth/sign-in/email"',
        requests: 10,
        periodSeconds: 10,
        mitigationSeconds: 10,
      },
    ],
    customRules: [
      {
        name: "block-scanners",
        expression:
          '(http.request.uri.path contains "/wp-login.php") or (http.request.uri.path contains "/xmlrpc.php") or (http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git/")',
        action: "block",
      },
    ],
  },
});
