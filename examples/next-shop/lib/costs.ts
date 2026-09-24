/**
 * What Cloudflare charges, in one place.
 *
 * Checked against Cloudflare's pricing pages on 24 September 2026. They change; when
 * they do, change them here rather than in the page that displays them. The docs cover
 * the reasoning behind these numbers:
 * https://flare-docs.codetotech.com/guides/costs/
 *
 * Nothing here is a bill. The app can see how much it stores; it cannot see how many
 * requests it served or how many rows it read — those live in Cloudflare's analytics,
 * behind an API token this app deliberately doesn't hold. So this is a model, and the
 * page that shows it says so.
 */

/** The Workers Paid subscription, which is the whole bill for most apps. */
export const SUBSCRIPTION_USD = 5;

/** Free plan allowances. Daily where Cloudflare counts them daily. */
export const FREE = {
  requestsPerDay: 100_000,
  /** CPU milliseconds per invocation — the one that bites a server-rendered app. */
  cpuMsPerRequest: 10,
  d1RowsReadPerDay: 5_000_000,
  d1RowsWrittenPerDay: 100_000,
  d1StorageGb: 5,
  r2StorageGb: 10,
  kvReadsPerDay: 100_000,
  /** A thousand a day, and every cache miss is a write. */
  kvWritesPerDay: 1_000,
} as const;

/** Paid plan: what's included each month, then the rate past it. */
export const PAID = {
  requests: { included: 10_000_000, perMillionUsd: 0.3 },
  cpuMs: { included: 30_000_000, perMillionUsd: 0.02 },
  d1RowsRead: { included: 25_000_000_000, perMillionUsd: 0.001 },
  d1RowsWritten: { included: 50_000_000, perMillionUsd: 1 },
  d1StorageGb: { included: 5, perGbMonthUsd: 0.75 },
  r2StorageGb: { included: 10, perGbMonthUsd: 0.015 },
  kvReads: { included: 10_000_000, perMillionUsd: 0.5 },
  kvWrites: { included: 1_000_000, perMillionUsd: 5 },
} as const;

/**
 * What one page view costs, measured on the example shop.
 *
 * A dashboard page runs the stats query, the chart, the table's page and its capped
 * count, plus one lookup per relation shown — four to six queries, reading around a
 * hundred rows between them once the indexes are doing their job. A page on the public
 * side is lighter. These are the assumptions the estimate below rests on, and they are
 * written down so you can argue with them.
 */
export const PER_VIEW = {
  d1RowsRead: 100,
  d1RowsWritten: 0.2,
  kvReads: 4,
  /** Cache misses are rarer than hits; most views read a warm entry. */
  kvWrites: 0.3,
  cpuMs: 25,
} as const;

export interface Estimate {
  monthlyViews: number;
  requests: number;
  d1RowsRead: number;
  d1RowsWritten: number;
  kvReads: number;
  kvWrites: number;
  cpuMs: number;
  /** Dollars on top of the subscription. */
  overageUsd: number;
  totalUsd: number;
  /** Which free-plan allowance this traffic would break first, if any. */
  freePlanVerdict: string;
}

const over = (used: number, included: number, perMillionUsd: number) =>
  used <= included ? 0 : ((used - included) / 1_000_000) * perMillionUsd;

/** What a month at this traffic would cost, and whether the free plan could carry it. */
export function estimate(monthlyViews: number, storedGb: { d1: number; r2: number }): Estimate {
  const requests = monthlyViews;
  const d1RowsRead = monthlyViews * PER_VIEW.d1RowsRead;
  const d1RowsWritten = monthlyViews * PER_VIEW.d1RowsWritten;
  const kvReads = monthlyViews * PER_VIEW.kvReads;
  const kvWrites = monthlyViews * PER_VIEW.kvWrites;
  const cpuMs = monthlyViews * PER_VIEW.cpuMs;

  const overageUsd =
    over(requests, PAID.requests.included, PAID.requests.perMillionUsd) +
    over(cpuMs, PAID.cpuMs.included, PAID.cpuMs.perMillionUsd) +
    over(d1RowsRead, PAID.d1RowsRead.included, PAID.d1RowsRead.perMillionUsd) +
    over(d1RowsWritten, PAID.d1RowsWritten.included, PAID.d1RowsWritten.perMillionUsd) +
    over(kvReads, PAID.kvReads.included, PAID.kvReads.perMillionUsd) +
    over(kvWrites, PAID.kvWrites.included, PAID.kvWrites.perMillionUsd) +
    Math.max(0, storedGb.d1 - PAID.d1StorageGb.included) * PAID.d1StorageGb.perGbMonthUsd +
    Math.max(0, storedGb.r2 - PAID.r2StorageGb.included) * PAID.r2StorageGb.perGbMonthUsd;

  const daily = monthlyViews / 30;
  const broken: string[] = [];
  if (daily > FREE.requestsPerDay) broken.push("requests");
  if (daily * PER_VIEW.d1RowsRead > FREE.d1RowsReadPerDay) broken.push("D1 rows read");
  if (daily * PER_VIEW.kvWrites > FREE.kvWritesPerDay) broken.push("KV writes");
  if (storedGb.r2 > FREE.r2StorageGb) broken.push("R2 storage");
  if (storedGb.d1 > FREE.d1StorageGb) broken.push("D1 storage");

  return {
    monthlyViews,
    requests,
    d1RowsRead,
    d1RowsWritten,
    kvReads,
    kvWrites,
    cpuMs,
    overageUsd,
    totalUsd: SUBSCRIPTION_USD + overageUsd,
    freePlanVerdict: broken.length === 0
      ? "Within the free allowances — but see the CPU note below."
      : `Past the free plan on ${broken.join(", ")}.`,
  };
}

/** "1.2M", "34k", "912" — counts that have to fit on a card. */
export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return Math.round(value).toLocaleString();
}

/** "$5.00", "$12.34". */
export const usd = (value: number) => `$${value.toFixed(2)}`;

/** "2.4 GB", "812 MB". */
export function gb(value: number): string {
  if (value >= 1) return `${value.toFixed(value >= 10 ? 0 : 2)} GB`;
  const mb = value * 1024;
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.round(mb * 1024)} KB`;
}
