/** Flare security: config, pure rules, and the zone (Cloudflare API) client. Importable anywhere. */
export {
  DEFAULT_DETECTORS,
  clientIp,
  defineSecurity,
  detectorMatches,
  isFlareRule,
  isIp,
  recordHit,
  zoneRuleTag,
  type Detector,
  type SecurityConfig,
  type Severity,
  type ZoneCustomRule,
  type ZoneRateLimit,
} from "./config.js";
export { CloudflareApiError, createZoneClient, type ZoneBan, type ZoneClient, type ZoneOptions } from "./zone.js";
