/**
 * Traffic, errors and latency for this Worker, from Cloudflare's GraphQL Analytics API.
 *
 * Needs two secrets, and works without them: `CLOUDFLARE_ACCOUNT_ID` and
 * `CLOUDFLARE_API_TOKEN` (a token with Account Analytics: Read). Without them the
 * dashboard says so and shows the rest of the page, because analytics is the one part
 * of an app that can't be read from its own database.
 *
 *   wrangler secret put CLOUDFLARE_API_TOKEN
 */
import { env } from "cloudflare:workers";

const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

export interface RequestPoint {
  /** "2026-09-22" */
  date: string;
  requests: number;
  errors: number;
  /** Median CPU time in milliseconds. */
  medianCpuMs: number;
}

export interface WorkerAnalytics {
  points: RequestPoint[];
  requests: number;
  errors: number;
  /** Errors as a percentage of requests. */
  errorRate: number;
  medianCpuMs: number;
}

/** Why there's nothing to show, when there's nothing to show. */
export type AnalyticsResult = { ok: true; data: WorkerAnalytics } | { ok: false; reason: "unconfigured" | "failed"; message: string };

interface GraphQlResponse {
  data?: {
    viewer?: {
      accounts?: {
        workersInvocationsAdaptive?: {
          dimensions: { date: string };
          sum: { requests: number; errors: number };
          quantiles: { cpuTimeP50: number };
        }[];
      }[];
    };
  };
  errors?: { message: string }[];
}

const QUERY = `query WorkerTraffic($accountTag: String!, $scriptName: String!, $since: Date!, $until: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 100
        filter: { scriptName: $scriptName, date_geq: $since, date_leq: $until }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum { requests errors }
        quantiles { cpuTimeP50 }
      }
    }
  }
}`;

/** Traffic for the last `days` days, a point per day. */
export async function workerAnalytics(scriptName: string, days = 7): Promise<AnalyticsResult> {
  const vars = env as unknown as Record<string, string | undefined>;
  const accountTag = vars.CLOUDFLARE_ACCOUNT_ID;
  const token = vars.CLOUDFLARE_API_TOKEN;
  if (!accountTag || !token) {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to read traffic, errors and CPU time from Cloudflare.",
    };
  }

  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: { accountTag, scriptName, since: day(days - 1), until: day(0) },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return { ok: false, reason: "failed", message: `Cloudflare answered ${response.status}. Check the token's Account Analytics: Read permission.` };
    }
    const body = (await response.json()) as GraphQlResponse;
    if (body.errors?.length) return { ok: false, reason: "failed", message: body.errors[0]!.message };

    const series = body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
    const points: RequestPoint[] = series.map((entry) => ({
      date: entry.dimensions.date,
      requests: entry.sum.requests,
      errors: entry.sum.errors,
      // Cloudflare reports CPU time in microseconds.
      medianCpuMs: Math.round((entry.quantiles.cpuTimeP50 / 1000) * 100) / 100,
    }));
    const requests = points.reduce((total, point) => total + point.requests, 0);
    const errors = points.reduce((total, point) => total + point.errors, 0);
    const medians = points.map((point) => point.medianCpuMs).sort((a, b) => a - b);
    return {
      ok: true,
      data: {
        points,
        requests,
        errors,
        errorRate: requests > 0 ? (errors / requests) * 100 : 0,
        medianCpuMs: medians.length ? medians[Math.floor(medians.length / 2)]! : 0,
      },
    };
  } catch (error) {
    return { ok: false, reason: "failed", message: error instanceof Error ? error.message : "Couldn't reach Cloudflare." };
  }
}
