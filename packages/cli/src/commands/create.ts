import { randomBytes } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import * as prompts from "@clack/prompts";
import pc from "picocolors";
import { FLARE_VERSION } from "@flaredev/core";
import { devVarsEntries, devVarsExampleEntries, parseAuthMethods, parseAuthProviders, renderAuthConfig } from "../auth-providers.js";
import { parseTheme } from "../themes.js";
import { APP_DEPENDENCIES, APP_DEV_DEPENDENCIES } from "../versions.js";
import { formatDuration } from "../terminal.js";
import { copyTemplate, findUp, templatesDir, writeJson } from "../utils/fs.js";
import { detectPackageManager, installArgs, isPackageManager, run, type PackageManager } from "../utils/pm.js";

export interface CreateOptions {
  install?: boolean;
  pm?: string;
  /** Comma-separated OAuth providers, e.g. "google,github". */
  authProviders?: string;
  /** Comma-separated sign-in methods (magic-link, email-otp, passkeys, 2fa-app, 2fa-email), "all" or "none". */
  auth?: string;
  /** One of the six themes (default when omitted). */
  theme?: string;
  /** Progress lines (default: console.log). */
  log?: (message: string) => void;
  /**
   * Run the install yourself, and report it: the CLI passes one that shows a spinner.
   * Only the exit code is read here. Default: inherit this process's output.
   */
  installer?: (packageManager: PackageManager, args: string[], dir: string) => number;
  /** Override "today" for the wrangler compatibility date (used by tests). */
  compatibilityDate?: string;
}

export interface CreateResult {
  dir: string;
  name: string;
  packageManager: PackageManager;
  inWorkspace: boolean;
}

/** Turn a directory name into a valid package / Worker name (lowercase, alphanumerics and dashes). */
export function toAppName(dir: string): string {
  const name = basename(resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!name) throw new Error(`Cannot derive an app name from "${dir}". Use letters, digits, and dashes.`);
  return name;
}

/**
 * How the app should depend on a Flare package (`core` or `cli`). When the CLI runs
 * from a checkout of the Flare repo (developing Flare itself), point at the
 * local package: `workspace:*` for apps inside that workspace, a link/file path for
 * apps elsewhere.
 */
export function flarePackageSpec(pkg: "core" | "cli", appDir: string, packageManager: PackageManager): string {
  const repoPackage = resolve(templatesDir, "../..", pkg);
  const repoRoot = resolve(repoPackage, "../..");
  // Installed from npm, @flaredev/cli and @flaredev/core are siblings too; only a checkout
  // of the Flare repo (packages/* under a pnpm workspace, not in node_modules) links locally.
  const fromCheckout =
    existsSync(join(repoPackage, "package.json")) &&
    existsSync(join(repoRoot, "pnpm-workspace.yaml")) &&
    !repoPackage.split(/[\\/]/).includes("node_modules");
  if (!fromCheckout) return `^${FLARE_VERSION}`;
  const rel = relative(repoRoot, appDir);
  // `relative` returns an absolute path when the app is on another drive (Windows).
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return "workspace:*";
  const protocol = packageManager === "pnpm" ? "link" : "file";
  return `${protocol}:${repoPackage.replaceAll("\\", "/")}`;
}

export function createApp(target: string, options: CreateOptions = {}): CreateResult {
  const dir = resolve(target);
  const name = toAppName(dir);

  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(`Directory ${dir} already exists and is not empty.`);
  }

  if (options.pm !== undefined && !isPackageManager(options.pm)) {
    throw new Error(`Unknown package manager "${options.pm}". Use pnpm, npm, yarn, or bun.`);
  }
  const packageManager = options.pm ?? detectPackageManager();
  const authProviders = parseAuthProviders(options.authProviders);
  const authMethods = parseAuthMethods(options.auth);
  const theme = parseTheme(options.theme);

  // When scaffolding inside an existing pnpm workspace (e.g. this repo's examples/),
  // the app joins that workspace instead of becoming its own root.
  const inWorkspace = findUp("pnpm-workspace.yaml", dirname(dir)) !== undefined;

  const compatibilityDate = options.compatibilityDate ?? new Date().toISOString().slice(0, 10);
  const files = copyTemplate(join(templatesDir, "app"), dir, {
    APP_NAME: name,
    COMPAT_DATE: compatibilityDate,
    PM: packageManager,
    THEME: theme,
  });
  writeFileSync(join(dir, "lib", "auth-config.ts"), renderAuthConfig(authMethods, authProviders));
  appendFileSync(join(dir, ".dev.vars.example"), devVarsExampleEntries(authProviders));

  writeJson(join(dir, "package.json"), {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "flare dev",
      build: "flare build",
      start: "flare start",
      deploy: "flare deploy",
      "cf-typegen": "wrangler types",
      "db:generate": "drizzle-kit generate",
      "db:migrate:local": "wrangler d1 migrations apply DB --local",
    },
    dependencies: { "@flaredev/core": flarePackageSpec("core", dir, packageManager), ...APP_DEPENDENCIES },
    devDependencies: { "@flaredev/cli": flarePackageSpec("cli", dir, packageManager), ...APP_DEV_DEPENDENCIES },
  });

  // Local secrets (git-ignored). Production secrets are set with `wrangler secret put`.
  writeFileSync(
    join(dir, ".dev.vars"),
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}\nRESEND_API_KEY=\nMAIL_FROM=\n${devVarsEntries(authProviders)}`,
  );

  if (packageManager === "pnpm" && !inWorkspace) {
    // pnpm blocks dependency build scripts unless explicitly allowed.
    writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n  workerd: true\n  sharp: false\n");
  }

  // A lockfile turns the install from "resolve 340 packages, then fetch them" into
  // just the fetch. Only for published versions: a checkout links @flaredev/* locally,
  // which the lockfile knows nothing about.
  const pinned = flarePackageSpec("core", dir, packageManager).startsWith("^");
  if (pinned) copyLockfile(packageManager, dir);

  const log = options.log ?? ((message: string) => console.log(message));
  log(`${pc.green("✔")} Wrote ${files} files to ${relative(process.cwd(), dir) || "."}`);
  if (options.install !== false) {
    const started = Date.now();
    const code = (options.installer ?? run)(packageManager, installArgs(packageManager), dir);
    if (code !== 0) throw new Error(`${packageManager} install failed (exit code ${code}).`);
    if (!options.installer) log(`${pc.green("✔")} Installed dependencies ${pc.dim(`(${formatDuration(Date.now() - started)})`)}`);
  }

  return { dir, name, packageManager, inWorkspace };
}

/** The lockfile shipped for this package manager, if there is one (yarn and bun have none). */
export function copyLockfile(packageManager: PackageManager, dir: string): boolean {
  const file = packageManager === "npm" ? "package-lock.json" : packageManager === "pnpm" ? "pnpm-lock.yaml" : undefined;
  if (!file) return false;
  const source = join(templatesDir, "locks", file);
  if (!existsSync(source)) return false;
  copyFileSync(source, join(dir, file));
  return true;
}

export function printNextSteps(result: CreateResult, installed: boolean) {
  const rel = relative(process.cwd(), result.dir) || ".";
  const pm = result.packageManager;
  const commands: [string, string][] = [
    [`cd ${rel}`, "your new app"],
    ...(installed ? [] : ([[`${pm} install`, "dependencies first"]] as [string, string][])),
    [`${pm} run dev`, "http://localhost:3000"],
    ["npx flare gen resource Contact", "a table, API and admin screens"],
    ["npx flare seed:resource Contact 1000", "fill it with sample rows"],
  ];
  const width = Math.max(...commands.map(([command]) => command.length)) + 2;
  const steps = commands.map(([command, note]) => `${pc.cyan(command.padEnd(width))}${pc.dim(note)}`);
  prompts.note(steps.join("\n"), "Next");
  prompts.outro(`${pc.bold(result.name)} is ready ${pc.dim("·")} ${pc.cyan("https://flare-docs.codetotech.com/start/quickstart/")}`);
}
