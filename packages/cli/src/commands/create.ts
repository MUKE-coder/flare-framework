import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import pc from "picocolors";
import { FLARE_VERSION } from "@flaredev/core";
import { devVarsEntries, devVarsExampleEntries, parseAuthProviders, socialProvidersCode } from "../auth-providers.js";
import { APP_DEPENDENCIES, APP_DEV_DEPENDENCIES } from "../versions.js";
import { copyTemplate, findUp, templatesDir, writeJson } from "../utils/fs.js";
import { detectPackageManager, installArgs, isPackageManager, run, runQuiet, type PackageManager } from "../utils/pm.js";

export interface CreateOptions {
  install?: boolean;
  pm?: string;
  /** Comma-separated OAuth providers, e.g. "google,github". */
  authProviders?: string;
  /** Progress lines (default: console.log). */
  log?: (message: string) => void;
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

  // When scaffolding inside an existing pnpm workspace (e.g. this repo's examples/),
  // the app joins that workspace instead of becoming its own root.
  const inWorkspace = findUp("pnpm-workspace.yaml", dirname(dir)) !== undefined;

  const compatibilityDate = options.compatibilityDate ?? new Date().toISOString().slice(0, 10);
  copyTemplate(join(templatesDir, "app"), dir, {
    APP_NAME: name,
    COMPAT_DATE: compatibilityDate,
    PM: packageManager,
    SOCIAL_PROVIDERS: socialProvidersCode(authProviders),
  });
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

  const log = options.log ?? ((message: string) => console.log(message));
  if (options.install !== false) {
    log(`${pc.green("✔")} Wrote the app to ${relative(process.cwd(), dir) || "."}`);
    log(`${pc.cyan("●")} Installing dependencies with ${packageManager}. The first install downloads the Workers runtime and toolchain, so it can take a few minutes.\n`);
    const started = Date.now();
    const code = run(packageManager, installArgs(packageManager), dir);
    if (code !== 0) throw new Error(`${packageManager} install failed (exit code ${code}).`);
    log(`${pc.green("✔")} Installed dependencies ${pc.dim(`(${formatDuration(Date.now() - started)})`)}`);

    // Generate worker-configuration.d.ts so `env.DB` and other bindings are typed.
    // wrangler prints the whole generated file; keep it unless something fails.
    const typegen = runQuiet(packageManager, ["run", "cf-typegen"], dir);
    if (typegen.code !== 0) {
      process.stderr.write(typegen.output);
      throw new Error(`wrangler types failed (exit code ${typegen.code}).`);
    }
    log(`${pc.green("✔")} Generated types for the Cloudflare bindings`);
  }

  return { dir, name, packageManager, inWorkspace };
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function printNextSteps(result: CreateResult, installed: boolean) {
  const rel = relative(process.cwd(), result.dir) || ".";
  const pm = result.packageManager;
  const step = (command: string, note: string) => `  ${command.padEnd(30)}${pc.dim(note)}`;
  console.log(`\n${pc.green("✔")} Created ${pc.bold(result.name)}\n`);
  console.log("Next steps:");
  console.log(`  cd ${rel}`);
  if (!installed) console.log(`  ${pm} install`);
  console.log(step(`${pm} run dev`, "start it at http://localhost:3000"));
  console.log(step("npx flare gen resource ...", "add your first resource"));
  console.log(`\nQuickstart: ${pc.cyan("https://flare-docs.codetotech.com/start/quickstart/")}`);
}
