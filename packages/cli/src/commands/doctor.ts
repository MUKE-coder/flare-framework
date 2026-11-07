/**
 * `flare doctor` — the things that are wrong before anything runs.
 *
 * The first thing to suggest when somebody says it does not work. Every check answers
 * the same way: what it looked at, what it found, and the command that fixes it. A check
 * that cannot run says so rather than guessing, because "cannot tell" and "fine" are
 * different answers and only one of them is reassuring.
 *
 * Nothing here changes anything. It is safe to run on production config, and safe to run
 * when the app is already broken — which is the only time anybody runs it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FLARE_VERSION, ratesIn } from "@flaredev/core";
import pc from "picocolors";
import { loadResources } from "../generator/load.js";
import { applyPlan, planFiles } from "../generator/plan.js";
import { loadPolicies } from "../generator/policy.js";
import { latestSnapshot } from "../generator/migrations.js";
import { pendingRenames } from "../generator/rename.js";
import { readStack, type Stack } from "../stack.js";
import { REQUIRED_SECRET, resourcesWithoutPolicy } from "./deploy.js";
import { appliedMigrations } from "./migrate.js";
import { findAppRoot } from "./run.js";

export type Verdict = "ok" | "warn" | "fail" | "skip";

export interface Finding {
  /** Short name of what was checked, e.g. "Node". */
  check: string;
  verdict: Verdict;
  /** What was found, in one line. */
  detail: string;
  /** What to do about it, when there is something. */
  fix?: string;
}

export interface DoctorOptions {
  cwd?: string;
  log?: (message: string) => void;
  /** Skip the checks that shell out (migrations), for a fast or offline run. */
  offline?: boolean;
}

/** The lowest Node a Flare app runs on: the version Workers and Next 16 both need. */
export const MINIMUM_NODE = 22;

/**
 * Node's major version against the minimum.
 *
 * Takes the version string rather than reading `process.version`, because the interesting
 * cases are the ones this machine is not running.
 */
export function checkNode(version: string): Finding {
  const major = Number(/^v?(\d+)/.exec(version)?.[1]);
  if (!Number.isFinite(major)) {
    return { check: "Node", verdict: "skip", detail: `Could not read a version from "${version}".` };
  }
  if (major < MINIMUM_NODE) {
    return {
      check: "Node",
      verdict: "fail",
      detail: `${version} — Flare needs Node ${MINIMUM_NODE} or newer.`,
      fix: `Install Node ${MINIMUM_NODE}+ (nvm install ${MINIMUM_NODE}).`,
    };
  }
  return { check: "Node", verdict: "ok", detail: version };
}

/** Which package manager the app's lockfile implies, if any. */
export function detectPackageManager(appRoot: string): { name: string; lockfile: string } | undefined {
  const lockfiles: [string, string][] = [
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
  ];
  for (const [lockfile, name] of lockfiles) {
    if (existsSync(join(appRoot, lockfile))) return { name, lockfile };
  }
  return undefined;
}

/**
 * An env file as key → value.
 *
 * Split on the *first* `=` only, which is the whole trick: a base64 secret ends in `=`
 * padding, and splitting on every `=` makes `SECRET=abc==` look like an empty value. That
 * is a false alarm on the one variable every app has.
 */
export function parseEnvFile(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key) values.set(key, value);
  }
  return values;
}

/**
 * What is wrong with the real env file, judged against the example beside it.
 *
 * Two different answers, because they deserve different urgency. A key that is not there
 * at all means the file was not copied or has fallen behind the example. A *required* key
 * that is there but empty is worse: the app starts and then fails somewhere that does not
 * mention it.
 *
 * Only `required` is held against an empty value. The example cannot tell required from
 * optional by whether it has a value — it leaves both blank, and says in a comment that
 * mail can stay empty to print to the console — so the one secret the app genuinely
 * cannot run without is named, the same one `flare deploy` generates when it is missing.
 */
export function envProblems(example: string, actual: string, required: readonly string[] = [REQUIRED_SECRET]): { absent: string[]; empty: string[] } {
  const wanted = parseEnvFile(example);
  const have = parseEnvFile(actual);
  const absent = [...wanted.keys()].filter((key) => !have.has(key));
  const empty = required.filter((key) => have.get(key) === "");
  return { absent, empty };
}

/** The env file a stack reads, and the example beside it. */
const envFiles = (stack: Stack) => (stack === "next" ? { actual: ".env", example: ".env.example" } : { actual: ".dev.vars", example: ".dev.vars.example" });

function checkEnv(appRoot: string, stack: Stack): Finding {
  const { actual, example } = envFiles(stack);
  const examplePath = join(appRoot, example);
  if (!existsSync(examplePath)) return { check: "Environment", verdict: "skip", detail: `No ${example} to compare against.` };
  if (!existsSync(join(appRoot, actual))) {
    return {
      check: "Environment",
      verdict: "fail",
      detail: `${actual} is missing, so nothing that needs a secret will start.`,
      fix: `cp ${example} ${actual}, then fill it in.`,
    };
  }
  const { absent, empty } = envProblems(readFileSync(examplePath, "utf8"), readFileSync(join(appRoot, actual), "utf8"));
  if (empty.length > 0) {
    return {
      check: "Environment",
      verdict: "fail",
      detail: `${empty.join(", ")} is empty in ${actual}, and the app cannot run without it.`,
      fix: `Generate one: openssl rand -base64 32`,
    };
  }
  if (absent.length > 0) {
    return {
      check: "Environment",
      verdict: "warn",
      detail: `${actual} does not have ${absent.join(", ")}, which ${example} lists.`,
      fix: `Add them to ${actual} if the features that read them are in use.`,
    };
  }
  return { check: "Environment", verdict: "ok", detail: `${actual} has every key ${example} lists.` };
}

/** Bindings a Cloudflare app's wrangler config declares, by kind. */
export function declaredBindings(wranglerConfig: string): { d1: boolean; r2: boolean; kv: boolean } {
  // Comments are legal in wrangler.jsonc, so this reads the text rather than parsing it.
  return {
    d1: /"d1_databases"\s*:/.test(wranglerConfig),
    r2: /"r2_buckets"\s*:/.test(wranglerConfig),
    kv: /"kv_namespaces"\s*:/.test(wranglerConfig),
  };
}

function checkBindings(appRoot: string, stack: Stack): Finding {
  if (stack === "next") {
    const envPath = join(appRoot, ".env");
    const url = existsSync(envPath) && /^\s*DATABASE_URL\s*=\s*\S/m.test(readFileSync(envPath, "utf8"));
    return url
      ? { check: "Database", verdict: "ok", detail: "DATABASE_URL is set." }
      : {
          check: "Database",
          verdict: "fail",
          detail: "DATABASE_URL is not set, so Prisma has nothing to connect to.",
          fix: "Set DATABASE_URL in .env (docker compose up -d starts the local Postgres).",
        };
  }
  const configPath = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"].map((name) => join(appRoot, name)).find((path) => existsSync(path));
  if (!configPath) {
    return { check: "Bindings", verdict: "fail", detail: "No wrangler config, so there is nothing to deploy.", fix: "This does not look like a Flare app." };
  }
  const bindings = declaredBindings(readFileSync(configPath, "utf8"));
  const missing = [!bindings.d1 && "a D1 database", !bindings.r2 && "an R2 bucket"].filter(Boolean) as string[];
  if (missing.length === 0) return { check: "Bindings", verdict: "ok", detail: "D1 and R2 are both bound." };
  return {
    check: "Bindings",
    verdict: "warn",
    detail: `wrangler config declares no ${missing.join(" and no ")}.`,
    fix: "Add the binding, or ignore this if the app does not use it.",
  };
}

/** The version of @flaredev/core the app has installed, if it can be read. */
export function installedCoreVersion(appRoot: string): string | undefined {
  const path = join(appRoot, "node_modules", "@flaredev", "core", "package.json");
  if (!existsSync(path)) return undefined;
  try {
    return (JSON.parse(readFileSync(path, "utf8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

/** Whether the app's engine is older than the CLI generating into it. */
export function checkTemplateVersion(installed: string | undefined, cli: string): Finding {
  if (!installed) {
    return { check: "Flare version", verdict: "skip", detail: "@flaredev/core is not installed yet.", fix: "Install dependencies." };
  }
  if (installed === cli) return { check: "Flare version", verdict: "ok", detail: `app and CLI are both ${cli}.` };
  const order = (version: string) => version.split(/[.-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  const [a, b] = [order(installed), order(cli)];
  let older = false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left === right) continue;
    older = typeof left === "number" && typeof right === "number" ? left < right : String(left) < String(right);
    break;
  }
  return older
    ? {
        check: "Flare version",
        verdict: "warn",
        detail: `app has @flaredev/core ${installed}, this CLI is ${cli}.`,
        fix: "Update the app's dependencies, then `flare update` to take the template changes you want.",
      }
    : { check: "Flare version", verdict: "warn", detail: `app has @flaredev/core ${installed}, which is newer than this CLI (${cli}).`, fix: "Update the CLI." };
}

/** The version of an installed package, if it can be read. */
export function installedVersion(appRoot: string, name: string): string | undefined {
  const path = join(appRoot, "node_modules", ...name.split("/"), "package.json");
  if (!existsSync(path)) return undefined;
  try {
    return (JSON.parse(readFileSync(path, "utf8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

/** The three Prisma packages a Next.js app installs, which have to agree. */
export const PRISMA_PACKAGES = ["prisma", "@prisma/client", "@prisma/adapter-pg"] as const;

/**
 * Whether the app is still on Prisma 7, and on one version of it.
 *
 * Worth its own check because Prisma's own tooling pushes you off it. `prisma@latest`
 * is an 8.0 release candidate, and the update notifier prints
 * `npm i @prisma/client@latest` inside the output of `prisma migrate` — so the advice
 * an app's own commands give leads to a prerelease. Flare's generated code, the
 * `prisma-client` generator and the driver adapter are written against 7.
 *
 * A split major is the other half of this: upgrading one package and not the other
 * three leaves a client the installed CLI did not generate, which fails at runtime
 * rather than at build, usually on the first query.
 */
export function checkPrismaVersions(versions: Record<string, string | undefined>): Finding {
  const found = Object.entries(versions).filter(([, version]) => version !== undefined) as [string, string][];
  if (found.length === 0) {
    return { check: "Prisma", verdict: "skip", detail: "Prisma is not installed yet.", fix: "Install dependencies." };
  }
  const majors = new Set(found.map(([, version]) => version.split(".")[0]));
  if (majors.size > 1) {
    return {
      check: "Prisma",
      verdict: "fail",
      detail: `the Prisma packages disagree on a major: ${found.map(([name, version]) => `${name} ${version}`).join(", ")}.`,
      fix: "Set all three to the same version. A client the installed CLI did not generate fails on the first query, not at build.",
    };
  }
  const [major] = [...majors];
  if (major !== "7") {
    const prerelease = found.find(([, version]) => version.includes("-"));
    return {
      check: "Prisma",
      verdict: "fail",
      detail: `the app is on Prisma ${major}${prerelease ? ` (${prerelease[1]}, a prerelease)` : ""}; Flare generates for 7.`,
      fix: "Pin prisma, @prisma/client and @prisma/adapter-pg to the same 7.x. `prisma@latest` is an 8.0 release candidate, so ask for the version by number.",
    };
  }
  const distinct = new Set(found.map(([, version]) => version));
  if (distinct.size > 1) {
    return {
      check: "Prisma",
      verdict: "warn",
      detail: `Prisma 7, but at mixed versions: ${found.map(([name, version]) => `${name} ${version}`).join(", ")}.`,
      fix: "Match them. They are released together and are only tested together.",
    };
  }
  return { check: "Prisma", verdict: "ok", detail: `Prisma ${[...distinct][0]}, all three in step.` };
}

/**
 * Whether the app can actually count the rate limits its descriptors declare.
 *
 * A declared limit that is not enforced is the worst of the three states — worse than no
 * limit, because the descriptor says there is one. The route logs it once at runtime;
 * this is where it is findable before anything is deployed.
 */
export function checkRateLimitBackend(declared: { resource: string; action: string; spec: string }[], configured: boolean, stack: Stack): Finding {
  if (declared.length === 0) return { check: "Rate limits", verdict: "ok", detail: "none declared." };
  const list = declared.map((entry) => `${entry.resource}.${entry.action} ${entry.spec}`).join(", ");
  if (configured) return { check: "Rate limits", verdict: "ok", detail: list };
  return {
    check: "Rate limits",
    verdict: "fail",
    detail: `${list} — declared, but nothing is counting them.`,
    fix:
      stack === "next"
        ? "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
        : 'Add the FLARE_RATE_LIMIT Durable Object binding (class_name "RateLimitCounter") to wrangler.jsonc.',
  };
}

/** Every check, run against the app at `cwd`. */
export async function diagnose(options: DoctorOptions = {}): Promise<Finding[]> {
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const stack = readStack(appRoot);
  const findings: Finding[] = [checkNode(process.version)];

  const manager = detectPackageManager(appRoot);
  if (!manager) {
    findings.push({ check: "Package manager", verdict: "warn", detail: "No lockfile, so dependencies are not pinned.", fix: "Install dependencies to write one." });
  } else {
    let version: string | undefined;
    try {
      version = execFileSync(manager.name, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: true }).trim();
    } catch {
      version = undefined;
    }
    findings.push(
      version
        ? { check: "Package manager", verdict: "ok", detail: `${manager.name} ${version} (${manager.lockfile}).` }
        : {
            check: "Package manager",
            verdict: "fail",
            detail: `${manager.lockfile} is a ${manager.name} lockfile, but ${manager.name} is not on PATH.`,
            fix: `Install ${manager.name}, or delete ${manager.lockfile} and install with the one you use.`,
          },
    );
  }

  findings.push({ check: "Stack", verdict: "ok", detail: stack === "next" ? "Next.js (Prisma, Postgres)." : "Cloudflare (vinext, D1, Drizzle)." });
  findings.push(checkTemplateVersion(installedCoreVersion(appRoot), FLARE_VERSION));
  // Next.js only: the Cloudflare stack is Drizzle and has no Prisma to disagree about.
  if (stack === "next") {
    findings.push(checkPrismaVersions(Object.fromEntries(PRISMA_PACKAGES.map((name) => [name, installedVersion(appRoot, name)]))));
  }
  findings.push(checkEnv(appRoot, stack));
  findings.push(checkBindings(appRoot, stack));

  // Descriptors, and everything derived from them.
  let resources: Awaited<ReturnType<typeof loadResources>> = [];
  try {
    resources = await loadResources(appRoot);
    findings.push({
      check: "Descriptors",
      verdict: "ok",
      detail:
        resources.length === 0
          ? "No resources yet."
          : `${resources.length} resource${resources.length === 1 ? " loads" : "s load"} cleanly.`,
    });
  } catch (error) {
    findings.push({
      check: "Descriptors",
      verdict: "fail",
      detail: `A descriptor does not load: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      fix: "Fix the descriptor; nothing downstream can be checked until it loads.",
    });
    return findings;
  }

  if (resources.length > 0) {
    const policies = await loadPolicies(appRoot);
    const plan = applyPlan(appRoot, planFiles(resources, policies, stack), { dryRun: true });
    const stale = plan.filter((file) => file.outcome === "create" || file.outcome === "update");
    const drifted = plan.filter((file) => file.outcome === "skipped-drift");
    findings.push(
      stale.length === 0 && drifted.length === 0
        ? { check: "Generated files", verdict: "ok", detail: "every derived file matches its descriptor." }
        : {
            check: "Generated files",
            verdict: drifted.length ? "warn" : "fail",
            detail: [
              stale.length ? `${stale.length} file(s) out of date` : "",
              drifted.length ? `${drifted.length} with hand edits inside a generated block` : "",
            ]
              .filter(Boolean)
              .join(", ") + ".",
            fix: drifted.length ? "flare sync-types (--force to overwrite the hand-edited blocks)" : "flare sync-types",
          },
    );

    // Rate limits, and whether anything is counting them.
    const declaredRates = resources.flatMap(({ resource }) =>
      ratesIn(resource.rateLimit).map((entry) => ({ resource: resource.name, action: entry.action, spec: entry.spec })),
    );
    if (declaredRates.length > 0 || stack === "next") {
      const configured =
        stack === "next"
          ? (() => {
              const envPath = join(appRoot, ".env");
              if (!existsSync(envPath)) return false;
              const values = parseEnvFile(readFileSync(envPath, "utf8"));
              return Boolean(values.get("UPSTASH_REDIS_REST_URL") && values.get("UPSTASH_REDIS_REST_TOKEN"));
            })()
          : (() => {
              const configPath = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"].map((name) => join(appRoot, name)).find((path) => existsSync(path));
              return configPath ? /FLARE_RATE_LIMIT/.test(readFileSync(configPath, "utf8")) : false;
            })();
      findings.push(checkRateLimitBackend(declaredRates, configured, stack));
    }

    const open = resourcesWithoutPolicy(resources, policies);
    findings.push(
      open.length === 0
        ? { check: "Policies", verdict: "ok", detail: "every resource has one." }
        : {
            check: "Policies",
            verdict: "warn",
            detail: `${open.join(", ")} ${open.length === 1 ? "has" : "have"} no policy, so any signed-in user can read and write ${open.length === 1 ? "it" : "them"}.`,
            fix: "flare gen policy <Name> --roles admin",
          },
    );

    if (stack !== "next") {
      const pending = pendingRenames(resources, latestSnapshot(appRoot));
      if (pending.length > 0) {
        findings.push({
          check: "Renames",
          verdict: "warn",
          detail: `${pending.map((rename) => `${rename.table}.${rename.from} → ${rename.to}`).join(", ")} declared but not migrated.`,
          fix: "flare gen migration rename --from-schema",
        });
      }
    }
  }

  // Migrations, which is the one check that has to ask the database.
  if (stack === "next") {
    findings.push({ check: "Migrations", verdict: "skip", detail: "Prisma tracks these in the database; run `npx flare migrate --deploy` to apply any that are pending." });
  } else if (options.offline) {
    findings.push({ check: "Migrations", verdict: "skip", detail: "Skipped (--offline)." });
  } else {
    findings.push(await checkMigrations(appRoot, options));
  }

  return findings;
}

/** Migration files on disk against the ones the local database says it has run. */
async function checkMigrations(appRoot: string, options: DoctorOptions): Promise<Finding> {
  const dir = join(appRoot, "migrations");
  const onDisk = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".sql")).sort() : [];
  if (onDisk.length === 0) return { check: "Migrations", verdict: "ok", detail: "none yet." };
  try {
    const applied = new Set((await appliedMigrations({ cwd: appRoot }, 1000)).map((migration) => migration.name));
    const unapplied = onDisk.filter((name) => !applied.has(name));
    return unapplied.length === 0
      ? { check: "Migrations", verdict: "ok", detail: `all ${onDisk.length} applied locally.` }
      : {
          check: "Migrations",
          verdict: "fail",
          detail: `${unapplied.length} not applied locally: ${unapplied.slice(0, 3).join(", ")}${unapplied.length > 3 ? ", …" : ""}.`,
          fix: "flare migrate",
        };
  } catch (error) {
    // Never the thing that stops a doctor run: an unreachable database is a finding, not
    // a crash, and it is often the very problem being diagnosed.
    return {
      check: "Migrations",
      verdict: "skip",
      detail: `Could not ask the local database: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      fix: "Run `flare migrate` to create it, or pass --offline to skip this check.",
    };
  }
}

const SYMBOL: Record<Verdict, string> = {
  ok: pc.green("✔"),
  warn: pc.yellow("!"),
  fail: pc.red("✖"),
  skip: pc.dim("–"),
};

/** `flare doctor`. Exit code 1 when something failed, so CI can use it. */
export async function doctor(options: DoctorOptions = {}): Promise<number> {
  const log = options.log ?? ((message: string) => console.log(message));
  const findings = await diagnose(options);

  log("");
  const width = Math.max(...findings.map((finding) => finding.check.length));
  for (const finding of findings) {
    log(`${SYMBOL[finding.verdict]} ${finding.check.padEnd(width)}  ${finding.verdict === "ok" ? pc.dim(finding.detail) : finding.detail}`);
    if (finding.fix && finding.verdict !== "ok") log(`${" ".repeat(width + 4)}${pc.dim(`→ ${finding.fix}`)}`);
  }

  const failed = findings.filter((finding) => finding.verdict === "fail");
  const warned = findings.filter((finding) => finding.verdict === "warn");
  log("");
  if (failed.length === 0 && warned.length === 0) log(pc.green("Nothing to fix."));
  else {
    const parts = [failed.length ? `${failed.length} problem${failed.length === 1 ? "" : "s"}` : "", warned.length ? `${warned.length} warning${warned.length === 1 ? "" : "s"}` : ""];
    log(parts.filter(Boolean).join(", ") + ".");
  }
  return failed.length > 0 ? 1 : 0;
}
