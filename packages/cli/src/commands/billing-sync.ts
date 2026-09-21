import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { kebabCase } from "@flare/core";
import pc from "picocolors";
import { extractJson, readD1Databases, runWrangler } from "../utils/wrangler.js";
import { findAppRoot, resolveBin } from "./run.js";

export interface SyncPlansOptions {
  cwd?: string;
  /** Write to the deployed database instead of the local one. */
  remote?: boolean;
  /** Import every active Product, not only those tagged flare_app=<app name>. */
  all?: boolean;
  env?: string;
  log?: (message: string) => void;
}

export interface StripeProduct {
  id: string;
  name: string;
  description?: string | null;
  metadata?: { slug?: string; sort?: string; flare_app?: string } | null;
}

export interface StripePrice {
  id: string;
  type: "recurring" | "one_time" | string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count?: number } | null;
}

export interface PlanRow {
  name: string;
  slug: string;
  description: string | null;
  stripeProductId: string;
  stripePriceId: string;
  amount: number;
  currency: string;
  interval: "month" | "year" | null;
  sort: number;
}

/** Parse `KEY=VALUE` lines from the app's `.dev.vars`, plus keys already in the environment. */
export function stripeKeys(appRoot: string): Record<string, string> {
  const map: Record<string, string> = {};
  const path = join(appRoot, ".dev.vars");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
      if (match) map[match[1]!] = match[2]!.trim();
    }
  }
  for (const key of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
    if (process.env[key]) map[key] = process.env[key]!;
  }
  return map;
}

/**
 * Turn Stripe Products and their active Prices into Plan rows. One Product is one
 * plan; each Price (monthly, yearly, one-time, per currency) becomes its own row
 * with a distinct slug. Prices billed every N>1 months, or by the day or week,
 * don't fit the Plan model and are reported as skipped.
 */
export function planRows(catalog: Array<{ product: StripeProduct; prices: StripePrice[] }>): { rows: PlanRow[]; skipped: string[] } {
  const rows: PlanRow[] = [];
  const skipped: string[] = [];
  for (const { product, prices } of catalog) {
    const usable = prices.filter((price) => {
      const ok =
        price.unit_amount !== null &&
        (price.type === "one_time" ||
          (price.recurring !== null && ["month", "year"].includes(price.recurring.interval) && (price.recurring.interval_count ?? 1) === 1));
      if (!ok) skipped.push(`${product.name} (${price.id})`);
      return ok;
    });
    const currencies = new Set(usable.map((price) => price.currency));
    const base = product.metadata?.slug || kebabCase(product.name);
    for (const price of usable) {
      const interval = (price.recurring?.interval ?? null) as PlanRow["interval"];
      const parts = [base];
      if (usable.length > 1) parts.push(interval ?? "once");
      if (currencies.size > 1) parts.push(price.currency);
      const label = usable.length > 1 ? ` (${interval ? `${interval}ly` : "one-time"}${currencies.size > 1 ? `, ${price.currency.toUpperCase()}` : ""})` : "";
      rows.push({
        name: `${product.name}${label}`,
        slug: parts.join("-"),
        description: product.description ?? null,
        stripeProductId: product.id,
        stripePriceId: price.id,
        amount: price.unit_amount ?? 0,
        currency: price.currency,
        interval,
        sort: Number(product.metadata?.sort ?? 0) || 0,
      });
    }
  }
  return { rows, skipped };
}

const sql = (value: string | number | null) =>
  value === null ? "NULL" : typeof value === "number" ? String(Math.trunc(value)) : `'${value.replace(/'/g, "''")}'`;

/**
 * Upsert every row by its Stripe price, and deactivate plans whose price is no
 * longer active in Stripe so nobody can buy an archived price.
 */
export function renderSyncSql(rows: PlanRow[], newId: () => string = () => crypto.randomUUID()): string {
  const live = rows.map((row) => sql(row.stripePriceId)).join(", ");
  const slugs = rows.map((row) => sql(row.slug)).join(", ");
  // First retire rows whose price is gone. A plan whose price changed in Stripe gets
  // a new price id under the same slug, so the old row also gives up its slug (it
  // stays, deactivated, so existing subscribers on the old price still map to it).
  const retire =
    `UPDATE plans SET active = 0` +
    (slugs ? `, slug = CASE WHEN slug IN (${slugs}) THEN slug || '-' || substr(coalesce(stripe_price_id, id), -8) ELSE slug END` : "") +
    ` WHERE stripe_price_id IS NOT NULL${live ? ` AND stripe_price_id NOT IN (${live})` : ""};`;
  const upserts = rows.map(
    (row) =>
      `INSERT INTO plans (id, name, slug, description, stripe_product_id, stripe_price_id, amount, currency, \`interval\`, active, sort) ` +
      `VALUES (${[newId(), row.name, row.slug, row.description, row.stripeProductId, row.stripePriceId, row.amount, row.currency, row.interval].map(sql).join(", ")}, 1, ${sql(row.sort)}) ` +
      `ON CONFLICT(stripe_price_id) DO UPDATE SET name = excluded.name, slug = excluded.slug, description = excluded.description, ` +
      `stripe_product_id = excluded.stripe_product_id, amount = excluded.amount, currency = excluded.currency, ` +
      `\`interval\` = excluded.\`interval\`, active = 1, sort = excluded.sort;`,
  );
  return [retire, ...upserts].join("\n") + "\n";
}

interface StripeList<T> {
  autoPagingToArray(options: { limit: number }): Promise<T[]>;
}
interface StripeClient {
  products: { list(args: { active: boolean; limit: number }): StripeList<StripeProduct> };
  prices: { list(args: { product: string; active: boolean; limit: number }): StripeList<StripePrice> };
  billingPortal: {
    configurations: {
      list(args: { active: boolean; limit: number }): StripeList<{ id: string; metadata: Record<string, string> | null }>;
      create(args: object): Promise<{ id: string }>;
      update(id: string, args: object): Promise<{ id: string }>;
    };
  };
}

/**
 * The portal settings plan changes rely on: switch between the synced subscription
 * plans (prorated), cancel at period end, update payment methods, see invoices.
 * Kept in a configuration tagged with this app (metadata flare_app), which its portal route uses.
 */
async function syncPortalConfiguration(stripe: StripeClient, rows: PlanRow[], appName: string): Promise<string | null> {
  const byProduct = new Map<string, string[]>();
  for (const row of rows) if (row.interval) byProduct.set(row.stripeProductId, [...(byProduct.get(row.stripeProductId) ?? []), row.stripePriceId]);
  if (byProduct.size === 0) return null;
  const settings = {
    business_profile: { headline: "Manage your subscription" },
    features: {
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: [...byProduct].map(([product, prices]) => ({ product, prices })),
      },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
    },
    metadata: { flare_app: appName },
  };
  const existing = (await stripe.billingPortal.configurations.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 1000 })).find(
    (configuration) => configuration.metadata?.flare_app === appName,
  );
  return existing ? (await stripe.billingPortal.configurations.update(existing.id, settings)).id : (await stripe.billingPortal.configurations.create(settings)).id;
}

/**
 * `flare billing:sync-plans [--remote]`
 *
 * Mirrors Stripe Products and their active Prices into the Plan table: recurring
 * monthly/yearly prices as subscription plans, one-time prices as things to buy
 * once. A Product's `metadata.slug` and `metadata.sort` win over the defaults.
 * Reads STRIPE_SECRET_KEY from .dev.vars or the environment.
 */
export async function syncPlans(options: SyncPlansOptions = {}): Promise<{ created: number; updated: number; skipped: string[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const key = stripeKeys(appRoot).STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set in .dev.vars or the environment.");
  const db = readD1Databases(appRoot)[0];
  if (!db) throw new Error("No d1_databases in wrangler.jsonc.");

  const appRequire = createRequire(join(appRoot, "package.json"));
  const stripeModule = (await import(pathToFileURL(appRequire.resolve("stripe")).href)) as { default: new (key: string, options: object) => StripeClient };
  const stripe = new stripeModule.default(key, { apiVersion: "2026-08-26.dahlia" });

  // Several apps often share one Stripe account: only this app's Products, unless --all.
  const appName = (JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8")) as { name?: string }).name ?? "app";
  const everything = await stripe.products.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 10_000 });
  const products = options.all ? everything : everything.filter((product) => product.metadata?.flare_app === appName);
  if (products.length === 0) {
    throw new Error(
      `No active Products in Stripe have metadata flare_app=${appName} (${everything.length} other active Products were ignored). ` +
        `Tag this app's Products, or pass --all to import every Product.`,
    );
  }
  const catalog = await Promise.all(
    products.map(async (product) => ({ product, prices: await stripe.prices.list({ product: product.id, active: true, limit: 100 }).autoPagingToArray({ limit: 10_000 }) })),
  );
  const { rows, skipped } = planRows(catalog);

  const wrangler = resolveBin(appRoot, "wrangler", "wrangler");
  const target = [options.remote ? "--remote" : "--local", ...(options.env ? ["--env", options.env] : [])];
  const existingResult = await runWrangler(wrangler, ["d1", "execute", db.binding, ...target, "--json", "--command", "SELECT stripe_price_id FROM plans"], appRoot, { capture: true });
  if (existingResult.code !== 0) {
    if (/no such table: plans/i.test(existingResult.output)) throw new Error(`The plans table doesn't exist yet. Run \`flare migrate${options.remote ? " --remote" : ""}\` first.`);
    throw new Error(`Could not read plans:\n${existingResult.output.trim()}`);
  }
  const known = new Set(extractJson<{ results: { stripe_price_id: string | null }[] }[]>(existingResult.output)[0]?.results.map((row) => row.stripe_price_id));

  const dir = mkdtempSync(join(tmpdir(), "flare-sync-"));
  try {
    const file = join(dir, "sync-plans.sql");
    writeFileSync(file, renderSyncSql(rows));
    const result = await runWrangler(wrangler, ["d1", "execute", db.binding, ...target, "--file", file], appRoot, { capture: true });
    if (result.code !== 0) throw new Error(`Could not write plans:\n${result.output.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  let created = 0;
  for (const row of rows) {
    const isNew = !known.has(row.stripePriceId);
    if (isNew) created++;
    const price = `${row.currency.toUpperCase()} ${(row.amount / 100).toFixed(2)}${row.interval ? `/${row.interval}` : " once"}`;
    log(`${(isNew ? pc.green("create") : pc.dim("update")).padEnd(18)} ${row.name} (${row.slug}) ${pc.dim(price)}`);
  }
  for (const name of skipped) log(pc.yellow(`skipped  ${name}: only monthly, yearly and one-time prices become plans`));

  const configuration = await syncPortalConfiguration(stripe, rows, appName);
  if (configuration) log(`${pc.dim("portal".padEnd(9))} plan changes enabled for ${new Set(rows.filter((row) => row.interval).map((row) => row.stripeProductId)).size} product(s) (${configuration})`);

  log(pc.green(`\n${rows.length} plan(s) synced to the ${options.remote ? "remote" : "local"} database; plans no longer active in Stripe were deactivated.`));
  return { created, updated: rows.length - created, skipped };
}
