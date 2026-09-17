import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import pc from "picocolors";

/**
 * `flare deploy` = migrations + `vinext-cloudflare deploy` + secrets.
 *
 * - Databases that already exist are migrated BEFORE the new code goes live, so code
 *   never runs against an older schema; a failed migration aborts the deploy.
 * - On a first deploy wrangler provisions the database during deploy, so its
 *   migrations run right after.
 * - A missing BETTER_AUTH_SECRET is generated and uploaded (never the local dev value).
 *   Optional secrets that are still unset are listed with the command to set them.
 */

export const REQUIRED_SECRET = "BETTER_AUTH_SECRET";
const MISSING_DATABASE = /Couldn't find a D1 DB/i;

export interface DeployArgs {
  /** Arguments passed on to vinext-cloudflare deploy. */
  forwarded: string[];
  skipMigrations: boolean;
  skipSecrets: boolean;
  /** Wrangler environment, forwarded to wrangler commands too. */
  env?: string;
  /** --dry-run / --help: only delegate, touch nothing remote. */
  passthroughOnly: boolean;
}

export function parseDeployArgs(args: string[]): DeployArgs {
  const forwarded: string[] = [];
  let skipMigrations = false;
  let skipSecrets = false;
  let env: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--skip-migrations") skipMigrations = true;
    else if (arg === "--skip-secrets") skipSecrets = true;
    else {
      forwarded.push(arg);
      if (arg === "--env" && args[i + 1]) env = args[i + 1];
      else if (arg.startsWith("--env=")) env = arg.slice("--env=".length);
      else if (arg === "--preview") env = "preview";
    }
  }
  const passthroughOnly = forwarded.some((arg) => ["--dry-run", "--help", "-h"].includes(arg));
  return { forwarded, skipMigrations, skipSecrets, env, passthroughOnly };
}

export interface D1Database {
  binding: string;
  database_name: string;
  migrations_dir?: string;
}

export function readD1Databases(appRoot: string): D1Database[] {
  const path = join(appRoot, "wrangler.jsonc");
  if (!existsSync(path)) return [];
  const config = parseJsonc(readFileSync(path, "utf8")) as { d1_databases?: D1Database[] } | undefined;
  return (config?.d1_databases ?? []).filter((db) => db.binding && db.database_name);
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

interface Captured {
  code: number;
  output: string;
}

function runWrangler(wranglerBin: string, args: string[], cwd: string, options: { capture?: boolean; stdin?: string } = {}) {
  return new Promise<Captured>((resolve, reject) => {
    const child = spawn(process.execPath, [wranglerBin, ...args], {
      cwd,
      // No TTY on stdin: wrangler uses its non-interactive defaults instead of prompting.
      stdio: [options.stdin !== undefined ? "pipe" : "ignore", options.capture ? "pipe" : "inherit", options.capture ? "pipe" : "inherit"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (output += chunk));
    if (options.stdin !== undefined) child.stdin!.end(options.stdin);
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

export interface DeployContext {
  appRoot: string;
  wranglerBin: string;
  /** Runs vinext-cloudflare deploy with the given args; resolves to its exit code. */
  deploy: (forwarded: string[]) => Promise<number>;
  log?: (message: string) => void;
}

export async function runDeploy(args: string[], context: DeployContext): Promise<number> {
  const plan = parseDeployArgs(args);
  if (plan.passthroughOnly) return context.deploy(plan.forwarded);

  const { appRoot, wranglerBin } = context;
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
