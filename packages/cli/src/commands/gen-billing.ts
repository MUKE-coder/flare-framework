import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import pc from "picocolors";
import {
  BILLING_POLICIES,
  BILLING_RESOURCES,
  billingDevVarsEntries,
  billingDevVarsExampleEntries,
  billingHeader,
  mergeBillingFields,
  renderBillingButton,
  renderBillingDescriptor,
  renderBillingPage,
  renderBillingPortalButton,
  renderCheckoutRoute,
  renderLibBilling,
  renderLibStripe,
  renderPortalRoute,
  renderWebhookRoute,
  validateBillingOptions,
  type BillingResource,
} from "../generator/billing.js";
import { descriptorPath } from "../generator/descriptor.js";
import { loadResources } from "../generator/load.js";
import { DriftError, hashBlock, splitMarkers, writeGenerated } from "../generator/markers.js";
import { generateSchemaMigration } from "../generator/migrations.js";
import { applyPlan, ensureSupportFiles, logResults, planFiles, type FileResult } from "../generator/plan.js";
import { loadPolicies, policyPath, renderPolicy } from "../generator/policy.js";
import { writeJson } from "../utils/fs.js";
import { detectPackageManager, run } from "../utils/pm.js";
import { findAppRoot } from "./run.js";

export interface GenBillingOptions {
  provider?: string;
  mode?: string;
  cwd?: string;
  force?: boolean;
  /** Skip adding the stripe dependency and installing (tests, offline setups). */
  skipInstall?: boolean;
  /** Skip running drizzle-kit (tests without an installed app). */
  skipMigration?: boolean;
  log?: (message: string) => void;
}

const STRIPE_DEP = "22.6.0";

/** Files `flare gen billing` owns. Each is marker-tracked, like every generator output. */
export function billingFiles(appName: string): { path: string; content: string }[] {
  return [
    { path: "lib/stripe.ts", content: renderLibStripe(appName) },
    { path: "lib/billing.ts", content: renderLibBilling() },
    { path: "app/api/billing/checkout/route.ts", content: renderCheckoutRoute() },
    { path: "app/api/billing/portal/route.ts", content: renderPortalRoute() },
    { path: "app/api/webhooks/stripe/route.ts", content: renderWebhookRoute() },
    { path: "components/billing/billing-button.tsx", content: renderBillingButton() },
    { path: "components/billing/billing-portal-button.tsx", content: renderBillingPortalButton() },
    { path: "app/dashboard/billing/page.tsx", content: renderBillingPage() },
  ];
}

/** Files earlier versions of `gen billing` wrote that no longer exist. Removed only if never edited. */
const RETIRED_FILES = ["app/api/billing/status/route.ts", "components/billing/subscribe-button.tsx"];

function appendVars(appRoot: string, target: ".dev.vars" | ".dev.vars.example") {
  const path = join(appRoot, target);
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (/STRIPE_SECRET_KEY/.test(text)) return false;
  appendFileSync(path, target === ".dev.vars" ? billingDevVarsEntries() : billingDevVarsExampleEntries());
  return true;
}

function addStripeDependency(appRoot: string): boolean {
  const path = join(appRoot, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8")) as { dependencies?: Record<string, string> };
  pkg.dependencies ??= {};
  if (pkg.dependencies.stripe) return false;
  pkg.dependencies.stripe = STRIPE_DEP;
  writeJson(path, pkg);
  return true;
}

/** Write a billing resource's descriptor, or merge the billing fields into an existing one. */
function writeBillingResource(appRoot: string, name: BillingResource, force: boolean | undefined, log: (message: string) => void) {
  const relative = descriptorPath(name);
  const path = join(appRoot, relative);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderBillingDescriptor(name));
    log(`${pc.green("create".padEnd(9))} ${relative}`);
    return;
  }
  const parts = splitMarkers(readFileSync(path, "utf8"));
  if (!parts) throw new Error(`${relative} has no generated fields block, so the billing fields can't be merged. Add them by hand: ${BILLING_RESOURCES[name]}`);
  const merged = mergeBillingFields(name, parts.block);
  if (!merged) {
    log(`${pc.dim("identical".padEnd(9))} ${relative} (has every billing field)`);
    return;
  }
  try {
    writeGenerated(path, merged, { force });
  } catch (error) {
    if (error instanceof DriftError) {
      throw new Error(`${relative}: its fields block was edited by hand, so the billing fields weren't merged. Pass --force, or add them yourself: ${BILLING_RESOURCES[name]}`);
    }
    throw error;
  }
  log(`${pc.yellow("update".padEnd(9))} ${relative} (added billing fields, kept yours)`);
}

/**
 * `flare gen billing --provider stripe --mode subscriptions`
 *
 * Scaffolds the Plan, Customer ("Subscription fields on Customer") and Purchase
 * resources with admin-only write policies, the signature-verified Stripe webhook,
 * Checkout for subscriptions and one-time purchases, portal-based plan changes and
 * cancellation, and a billing page at /dashboard/billing.
 */
export async function genBilling(options: GenBillingOptions = {}): Promise<{ files: FileResult[]; migrations: string[]; addedStripe: boolean }> {
  const log = options.log ?? ((message: string) => console.log(message));
  validateBillingOptions(options.provider, options.mode);
  const appRoot = findAppRoot(options.cwd ?? process.cwd());

  // Plan first: Customer and Purchase belong to it.
  for (const name of ["Plan", "Customer", "Purchase"] as const) writeBillingResource(appRoot, name, options.force, log);

  for (const [name, roles] of Object.entries(BILLING_POLICIES)) {
    const relative = policyPath(name);
    if (existsSync(join(appRoot, relative))) {
      log(`${pc.dim("kept".padEnd(9))} ${relative} (already exists)`);
      continue;
    }
    mkdirSync(join(appRoot, "policies"), { recursive: true });
    writeFileSync(join(appRoot, relative), renderPolicy(name, roles));
    log(`${pc.green("create".padEnd(9))} ${relative}`);
  }

  const files: FileResult[] = [];
  const appName = (JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8")) as { name?: string }).name ?? "app";
  for (const { path, content } of billingFiles(appName)) {
    const outcome = writeGenerated(join(appRoot, path), content, { header: billingHeader(), force: options.force });
    files.push({ path, status: "missing", outcome });
    const label = outcome === "create" ? pc.green("create") : outcome === "update" ? pc.yellow("update") : pc.dim("identical");
    log(`${label.padEnd(18)} ${path}`);
  }
  for (const path of RETIRED_FILES) {
    const absolute = join(appRoot, path);
    if (!existsSync(absolute)) continue;
    const parts = splitMarkers(readFileSync(absolute, "utf8"));
    // Only delete what we wrote and nobody touched: our header, a block matching its hash, nothing after it.
    const untouched =
      parts && parts.before.includes("flare gen billing") && !parts.after.trim() && parts.hash !== undefined && hashBlock(parts.block) === parts.hash;
    if (untouched) {
      unlinkSync(absolute);
      log(`${pc.red("remove".padEnd(9))} ${path} (no longer generated)`);
    } else {
      log(pc.yellow(`${path} is no longer generated but has your changes; remove it when you're done with it.`));
    }
  }

  if (appendVars(appRoot, ".dev.vars.example")) log(`${pc.green("append".padEnd(9))} .dev.vars.example`);
  if (appendVars(appRoot, ".dev.vars")) log(`${pc.green("append".padEnd(9))} .dev.vars`);
  const addedStripe = addStripeDependency(appRoot);
  if (addedStripe) log(`${pc.yellow("update".padEnd(9))} package.json (stripe@${STRIPE_DEP})`);

  if (!options.skipInstall) {
    const pm = detectPackageManager();
    const code = run(pm, ["install"], appRoot);
    if (code !== 0) throw new Error(`${pm} install failed (exit code ${code}).`);
    run(pm, ["run", "cf-typegen"], appRoot);
  }

  const all = await loadResources(appRoot);
  ensureSupportFiles(appRoot, log);
  logResults(applyPlan(appRoot, planFiles(all, await loadPolicies(appRoot)), { force: options.force }), log);

  let migrations: string[] = [];
  if (!options.skipMigration) {
    const result = await generateSchemaMigration(appRoot, "billing");
    migrations = result.files;
    for (const file of migrations) log(`${pc.green("create".padEnd(9))} ${file}`);
    for (const repair of result.repairs) log(pc.dim(`repaired  ${repair}`));
  }

  log(
    [
      "",
      `Next:`,
      `  1. Put a Stripe test key in .dev.vars (STRIPE_SECRET_KEY, ideally a restricted rk_test_ key).`,
      `  2. ${pc.bold("flare migrate")} to create the billing tables.`,
      `  3. Create one Product per plan in Stripe with metadata flare_app=${appName}, then ${pc.bold("flare billing:sync-plans")}.`,
      `  4. ${pc.bold("stripe listen --forward-to localhost:8787/api/webhooks/stripe")} and put its signing secret in STRIPE_WEBHOOK_SECRET.`,
      `  5. ${pc.bold("flare start")} and open ${pc.bold("/dashboard/billing")}.`,
    ].join("\n"),
  );
  return { files, migrations, addedStripe };
}
