// Create the demo's Stripe catalog in test mode (idempotent): two subscription
// plans and one one-time product, tagged flare_app=demo so billing:sync-plans
// imports them and nothing else in a shared Stripe account.
//
//   node scripts/stripe-demo-catalog.mjs
//
// Reads STRIPE_SECRET_KEY from examples/demo/.dev.vars and refuses live keys.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const demo = join(import.meta.dirname, "..", "examples", "demo");
const key = readFileSync(join(demo, ".dev.vars"), "utf8").match(/^STRIPE_SECRET_KEY=(.*)$/m)?.[1]?.trim();
if (!key) throw new Error("STRIPE_SECRET_KEY is not set in examples/demo/.dev.vars.");
if (!/^(sk|rk)_test_/.test(key)) throw new Error("Refusing to create a demo catalog with a live key.");

const Stripe = createRequire(join(demo, "package.json"))("stripe");
const stripe = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });

const CATALOG = [
  { name: "Starter", slug: "starter", sort: "1", description: "For solo projects.", amount: 900, recurring: { interval: "month" } },
  { name: "Pro", slug: "pro", sort: "2", description: "For growing teams.", amount: 2900, recurring: { interval: "month" } },
  { name: "Credit pack", slug: "credit-pack", sort: "3", description: "500 extra credits.", amount: 1500 },
];

const existing = (await stripe.products.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 10_000 })).filter(
  (product) => product.metadata?.flare_app === "demo",
);
for (const item of CATALOG) {
  const found = existing.find((product) => product.metadata?.slug === item.slug);
  if (found) {
    console.log(`kept     ${item.name} (${found.id})`);
    continue;
  }
  const product = await stripe.products.create({
    name: item.name,
    description: item.description,
    metadata: { flare_app: "demo", slug: item.slug, sort: item.sort },
    default_price_data: { currency: "usd", unit_amount: item.amount, ...(item.recurring ? { recurring: item.recurring } : {}) },
  });
  console.log(`created  ${item.name} (${product.id})`);
}
