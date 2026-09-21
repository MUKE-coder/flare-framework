import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createZoneClient, type SecurityConfig } from "@flaredev/core/security";
import { createJiti } from "jiti";
import pc from "picocolors";
import { readD1Databases, runWrangler, type D1Database } from "../utils/wrangler.js";

/**
 * `flare deploy` = migrations + `vinext-cloudflare deploy` + secrets.
 *
 * - Databases that already exist are migrated BEFORE the new code goes live, so code
 *   never runs against an older schema; a failed migration aborts the deploy.
 * - On a first deploy wrangler provisions the database during deploy, so its
 *   migrations run right after.
 * - A missing BETTER_AUTH_SECRET is generated and uploaded (never the local dev value).
 *   Optional secrets that are still unset are listed with the command to set them.
 * - With a security.config.ts and FLARE_SECURITY_ZONE_ID / FLARE_SECURITY_API_TOKEN in
 *   the shell, the config's zone rules are pushed to the zone and both values are
 *   uploaded as secrets, so the app can ban at the zone edge too.
 */

export const REQUIRED_SECRET = "BETTER_AUTH_SECRET";
const MISSING_DATABASE = /Couldn't find a D1 DB/i;

export interface DeployArgs {
  /** Arguments passed on to vinext-cloudflare deploy. */
  forwarded: string[];
  skipMigrations: boolean;
  skipSecrets: boolean;
  skipSecurity: boolean;
  /** Wrangler environment, forwarded to wrangler commands too. */
  env?: string;
  /** --dry-run / --help: only delegate, touch nothing remote. */
  passthroughOnly: boolean;
}

export function parseDeployArgs(args: string[]): DeployArgs {
  const forwarded: string[] = [];
  let skipMigrations = false;
  let skipSecrets = false;
  let skipSecurity = false;
  let env: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--skip-migrations") skipMigrations = true;
    else if (arg === "--skip-secrets") skipSecrets = true;
    else if (arg === "--skip-security") skipSecurity = true;
    else {
      forwarded.push(arg);
      if (arg === "--env" && args[i + 1]) env = args[i + 1];
      else if (arg.startsWith("--env=")) env = arg.slice("--env=".length);
      else if (arg === "--preview") env = "preview";
    }
  }
  const passthroughOnly = forwarded.some((arg) => ["--dry-run", "--help", "-h"].includes(arg));
  return { forwarded, skipMigrations, skipSecrets, skipSecurity, env, passthroughOnly };
}

/** Secret names from `wrangler secret list` output (a JSON array, possibly after a banner). */
export function parseSecretNames(output: string): string[] {
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end < start) throw new Error(`Unexpected output from wrangler secret list:\n${output}`);
  return (JSON.parse(output.slice(start, end + 1)) as { name: string }[]).map((secret) => secret.name);
}

/** Variable names declared (uncommented) in .dev.vars.example. */
export function declaredSecretNames(devVarsExample: string): string[] {
  return devVarsExample
    .split(/\r?\n/)
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line.trim())?.[1])
    .filter((name): name is string => Boolean(name));
}

export interface DeployContext {
  appRoot: string;
  wranglerBin: string;
  /** Runs vinext-cloudflare deploy with the given args; resolves to its exit code. */
  deploy: (forwarded: string[]) => Promise<number>;
  log?: (message: string) => void;
  /** Where zone credentials come from (default: process.env). */
  env?: Record<string, string | undefined>;
  /** Cloudflare API fetch (tests). */
  fetch?: typeof fetch;
}

export const ZONE_SECRETS = ["FLARE_SECURITY_ZONE_ID", "FLARE_SECURITY_API_TOKEN"] as const;

/** Load the app's security.config.ts, or null when the app has no security layer. */
export async function loadSecurityConfig(appRoot: string): Promise<SecurityConfig | null> {
  const path = join(appRoot, "security.config.ts");
  if (!existsSync(path)) return null;
  const jiti = createJiti(join(appRoot, "package.json"), { moduleCache: false, fsCache: false });
  const mod = (await jiti.import(path)) as { default?: SecurityConfig };
  if (!mod.default) throw new Error("security.config.ts must `export default defineSecurity({ ... })`.");
  return mod.default;
}

/**
 * Push the config's zone rules to the zone. Only rules tagged for this app are
 * replaced; the zone's other rules stay as they are.
 */
export async function provisionZoneSecurity(
  appRoot: string,
  config: SecurityConfig,
  credentials: { zoneId: string; apiToken: string },
  options: { log: (message: string) => void; fetch?: typeof fetch },
): Promise<void> {
  const app = (JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8")) as { name?: string }).name ?? "app";
  const zone = createZoneClient({ ...credentials, app, fetch: options.fetch });
  if (config.zone?.rateLimits) {
    const result = await zone.syncRateLimits(config.zone.rateLimits);
    options.log(`  rate limiting: ${result.written} Flare rule(s), ${result.kept} other rule(s) kept`);
  }
  if (config.zone?.customRules) {
    const result = await zone.syncCustomRules(config.zone.customRules);
    options.log(`  custom rules: ${result.written} Flare rule(s), ${result.kept} other rule(s) kept`);
  }
}

export async function runDeploy(args: string[], context: DeployContext): Promise<number> {
  const plan = parseDeployArgs(args);
  if (plan.passthroughOnly) return context.deploy(plan.forwarded);

  const { appRoot, wranglerBin } = context;
  const shellEnv = context.env ?? process.env;
  const log = context.log ?? ((message: string) => console.log(message));
  const envArgs = plan.env ? ["--env", plan.env] : [];
  const step = (message: string) => log(`\n${pc.bold(pc.cyan("flare"))} ${message}`);

  const databases = plan.skipMigrations
    ? []
    : readD1Databases(appRoot).filter((db) => existsSync(join(appRoot, db.migrations_dir ?? "migrations")));
  const migrateAfterDeploy: D1Database[] = [];

  const migrate = async (db: D1Database) => {
    step(`Applying migrations to ${db.database_name} (remote)`);
    const result = await runWrangler(wranglerBin, ["d1", "migrations", "apply", db.binding, "--remote", ...envArgs], appRoot);
    if (result.code !== 0) throw new Error(`Migrations failed for ${db.database_name}.`);
  };

  for (const db of databases) {
    const info = await runWrangler(wranglerBin, ["d1", "info", db.database_name, "--json", ...envArgs], appRoot, {
      capture: true,
    });
    if (info.code === 0) {
      await migrate(db);
    } else if (MISSING_DATABASE.test(info.output)) {
      step(`${db.database_name} doesn't exist yet: wrangler will create it during deploy, then migrations run.`);
      migrateAfterDeploy.push(db);
    } else {
      throw new Error(`Could not look up D1 database ${db.database_name}:\n${info.output.trim()}`);
    }
  }

  step("Deploying");
  const code = await context.deploy(plan.forwarded);
  if (code !== 0) return code;

  for (const db of migrateAfterDeploy) await migrate(db);

  const security = plan.skipSecurity ? null : await loadSecurityConfig(appRoot);
  const zoneId = shellEnv.FLARE_SECURITY_ZONE_ID;
  const apiToken = shellEnv.FLARE_SECURITY_API_TOKEN;
  if (security && zoneId && apiToken) {
    step("Provisioning zone security rules");
    await provisionZoneSecurity(appRoot, security, { zoneId, apiToken }, { log, fetch: context.fetch });
  } else if (security) {
    step("Zone security rules skipped (Worker-layer protection is on). To add them, deploy with FLARE_SECURITY_ZONE_ID and FLARE_SECURITY_API_TOKEN set.");
  }

  if (!plan.skipSecrets) {
    const listed = await runWrangler(wranglerBin, ["secret", "list", ...envArgs], appRoot, { capture: true });
    if (listed.code !== 0) throw new Error(`wrangler secret list failed:\n${listed.output.trim()}`);
    const existing = new Set(parseSecretNames(listed.output));

    if (!existing.has(REQUIRED_SECRET)) {
      step(`Generating ${REQUIRED_SECRET} for production`);
      const put = await runWrangler(wranglerBin, ["secret", "put", REQUIRED_SECRET, ...envArgs], appRoot, {
        capture: true,
        stdin: randomBytes(32).toString("base64"),
      });
      if (put.code !== 0) throw new Error(`Uploading ${REQUIRED_SECRET} failed:\n${put.output.trim()}`);
      existing.add(REQUIRED_SECRET);
    }

    // Hand the zone credentials to the app so its bans reach the zone edge.
    if (security && zoneId && apiToken) {
      for (const [name, value] of [["FLARE_SECURITY_ZONE_ID", zoneId], ["FLARE_SECURITY_API_TOKEN", apiToken]] as const) {
        if (existing.has(name)) continue;
        step(`Uploading ${name}`);
        const put = await runWrangler(wranglerBin, ["secret", "put", name, ...envArgs], appRoot, { capture: true, stdin: value });
        if (put.code !== 0) throw new Error(`Uploading ${name} failed:
${put.output.trim()}`);
        existing.add(name);
      }
    }

    const examplePath = join(appRoot, ".dev.vars.example");
    const optional = existsSync(examplePath)
      ? declaredSecretNames(readFileSync(examplePath, "utf8")).filter((name) => !existing.has(name))
      : [];
    if (optional.length > 0) {
      step("Optional secrets not set in production (features using them stay off):");
      for (const name of optional) log(`  wrangler secret put ${name}${plan.env ? ` --env ${plan.env}` : ""}`);
    }
  }

  return 0;
}
