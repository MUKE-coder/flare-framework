/**
 * The zone layer: a small client over Cloudflare's API for the three things Flare
 * manages on an app's zone. IP Access Rules (bans), the rate-limiting phase and the
 * custom WAF phase, plus firewall analytics for the dashboard.
 *
 * Every rule Flare writes is tagged `flare:<app>:<name>` (see zoneRuleTag), and every
 * write keeps whatever rules the zone already had that aren't Flare's. Use an API
 * token scoped to this one zone with Zone WAF Edit, Firewall Services Edit,
 * Analytics Read and Zone Read.
 */
import { isFlareRule, zoneRuleTag, type ZoneCustomRule, type ZoneRateLimit } from "./config.js";

const API = "https://api.cloudflare.com/client/v4";

export interface ZoneOptions {
  zoneId: string;
  apiToken: string;
  /** Tag prefix for this app's rules, usually the Worker's name. */
  app: string;
  fetch?: typeof fetch;
}

export interface ZoneBan {
  id: string;
  ip: string;
  notes: string;
  createdAt: string;
}

/** One ruleset rule as the API returns it (the fields Flare passes through). */
interface Rule {
  id?: string;
  ref?: string;
  action: string;
  expression: string;
  description?: string;
  enabled?: boolean;
  action_parameters?: unknown;
  ratelimit?: unknown;
  logging?: unknown;
}

export class CloudflareApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CloudflareApiError";
  }
}

export function createZoneClient(options: ZoneOptions) {
  const doFetch = options.fetch ?? fetch;
  const zone = `${API}/zones/${options.zoneId}`;

  async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await doFetch(url, {
      ...init,
      headers: { authorization: `Bearer ${options.apiToken}`, "content-type": "application/json", ...init.headers },
    });
    const body = (await response.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { message: string }[] } | null;
    if (!response.ok || body?.success === false) {
      const message = body?.errors?.map((error) => error.message).join("; ") || `Cloudflare API ${response.status}`;
      throw new CloudflareApiError(response.status, message);
    }
    return body?.result as T;
  }

  /** Keep the zone's own rules, replace this app's tagged ones with `ours`. */
  async function replacePhase(phase: string, ours: Rule[]): Promise<{ kept: number; written: number }> {
    let existing: Rule[] = [];
    try {
      existing = (await call<{ rules?: Rule[] }>(`${zone}/rulesets/phases/${phase}/entrypoint`)).rules ?? [];
    } catch (error) {
      if (!(error instanceof CloudflareApiError && error.status === 404)) throw error;
    }
    const kept = existing
      .filter((rule) => !isFlareRule(options.app, rule.description))
      .map(({ id, ref, action, expression, description, enabled, action_parameters, ratelimit, logging }) => ({
        id,
        ref,
        action,
        expression,
        description,
        enabled,
        action_parameters,
        ratelimit,
        logging,
      }));
    await call(`${zone}/rulesets/phases/${phase}/entrypoint`, { method: "PUT", body: JSON.stringify({ rules: [...kept, ...ours] }) });
    return { kept: kept.length, written: ours.length };
  }

  return {
    /** Provision this app's rate-limiting rules, leaving the zone's other rules alone. */
    syncRateLimits(rules: ZoneRateLimit[]) {
      return replacePhase(
        "http_ratelimit",
        rules.map((rule) => ({
          action: "block",
          expression: rule.expression,
          description: zoneRuleTag(options.app, rule.name),
          enabled: true,
          ratelimit: {
            characteristics: ["cf.colo.id", "ip.src"],
            period: rule.periodSeconds,
            requests_per_period: rule.requests,
            mitigation_timeout: rule.mitigationSeconds,
          },
        })),
      );
    },

    /** Provision this app's WAF custom rules, leaving the zone's other rules alone. */
    syncCustomRules(rules: ZoneCustomRule[]) {
      return replacePhase(
        "http_request_firewall_custom",
        rules.map((rule) => ({ action: rule.action, expression: rule.expression, description: zoneRuleTag(options.app, rule.name), enabled: true })),
      );
    },

    /** Block an IP at the edge for the whole zone. Idempotent. */
    async ban(ip: string, reason: string): Promise<ZoneBan> {
      const existing = (await this.bans()).find((ban) => ban.ip === ip);
      if (existing) return existing;
      const rule = await call<{ id: string; notes: string; created_on: string }>(`${zone}/firewall/access_rules/rules`, {
        method: "POST",
        body: JSON.stringify({ mode: "block", configuration: { target: ip.includes(":") ? "ip6" : "ip", value: ip }, notes: `${zoneRuleTag(options.app, "ban")} ${reason}`.slice(0, 250) }),
      });
      return { id: rule.id, ip, notes: rule.notes, createdAt: rule.created_on };
    },

    /** Remove this app's ban on an IP (never a ban someone else added). */
    async unban(ip: string): Promise<boolean> {
      const ban = (await this.bans()).find((entry) => entry.ip === ip);
      if (!ban) return false;
      await call(`${zone}/firewall/access_rules/rules/${ban.id}`, { method: "DELETE" });
      return true;
    },

    /** This app's active zone bans. */
    async bans(): Promise<ZoneBan[]> {
      const rules = await call<Array<{ id: string; mode: string; notes: string; created_on: string; configuration: { value: string } }>>(
        `${zone}/firewall/access_rules/rules?mode=block&per_page=500`,
      );
      return rules
        .filter((rule) => isFlareRule(options.app, rule.notes))
        .map((rule) => ({ id: rule.id, ip: rule.configuration.value, notes: rule.notes, createdAt: rule.created_on }));
    },

    /** Firewall events on the zone since `since`, grouped by action and source (for the dashboard). */
    async firewallEvents(since: Date): Promise<Array<{ count: number; action: string; source: string; description: string | null }>> {
      const query = `query FlareFirewall($zoneTag: string, $since: Time) {
        viewer { zones(filter: { zoneTag: $zoneTag }) {
          firewallEventsAdaptiveGroups(limit: 50, filter: { datetime_geq: $since }, orderBy: [count_DESC]) {
            count
            dimensions { action source description }
          }
        } }
      }`;
      const response = await doFetch(`${API}/graphql`, {
        method: "POST",
        headers: { authorization: `Bearer ${options.apiToken}`, "content-type": "application/json" },
        body: JSON.stringify({ query, variables: { zoneTag: options.zoneId, since: since.toISOString() } }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { viewer?: { zones?: Array<{ firewallEventsAdaptiveGroups?: Array<{ count: number; dimensions: { action: string; source: string; description?: string } }> }> } };
        errors?: { message: string }[] | null;
      } | null;
      if (!response.ok || body?.errors?.length) {
        throw new CloudflareApiError(response.status, body?.errors?.map((error) => error.message).join("; ") || `GraphQL ${response.status}`);
      }
      return (body?.data?.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups ?? []).map((group) => ({
        count: group.count,
        action: group.dimensions.action,
        source: group.dimensions.source,
        description: group.dimensions.description ?? null,
      }));
    },
  };
}

export type ZoneClient = ReturnType<typeof createZoneClient>;
