/**
 * Traffic, errors and latency — on Vercel, not from here.
 *
 * The Cloudflare stack reads these from Cloudflare's GraphQL Analytics API. Vercel's
 * equivalent needs a team token and a different shape of query, and an app shouldn't
 * hold a token that can read the whole account, so this reports "unconfigured" and the
 * observability page says where the numbers actually are.
 *
 * The types are kept identical so the page doesn't need two versions.
 */

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
export async function workerAnalytics(_scriptName: string, _days = 7): Promise<AnalyticsResult> {
  return {
    ok: false,
    reason: "unconfigured",
    message: "Traffic and error rates for this app are in your Vercel dashboard, under Observability.",
  };
}
