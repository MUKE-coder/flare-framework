import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import pc from "picocolors";
import { FLARE_VERSION } from "@flare/core";
import { APP_DEPENDENCIES, APP_DEV_DEPENDENCIES } from "../versions.js";
import { copyTemplate, findUp, templatesDir, writeJson } from "../utils/fs.js";
import { detectPackageManager, isPackageManager, run, type PackageManager } from "../utils/pm.js";

export interface CreateOptions {
  install?: boolean;
  pm?: string;
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
 * How the app should depend on @flare/core. When the CLI runs from a checkout of
 * the Flare repo (core isn't published yet), point at the local package:
 * `workspace:*` for apps inside that workspace, a link/file path for apps elsewhere.
 */
export function coreDependencySpec(appDir: string, packageManager: PackageManager): string {
  const repoCore = resolve(templatesDir, "../../core");
  if (!existsSync(join(repoCore, "package.json"))) return `^${FLARE_VERSION}`;
  const repoRoot = resolve(repoCore, "../..");
  const rel = relative(repoRoot, appDir);
  // `relative` returns an absolute path when the app is on another drive (Windows).
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return "workspace:*";
  const protocol = packageManager === "pnpm" ? "link" : "file";
  return `${protocol}:${repoCore.replaceAll("\\", "/")}`;
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

  // When scaffolding inside an existing pnpm workspace (e.g. this repo's examples/),
  // the app joins that workspace instead of becoming its own root.
  const inWorkspace = findUp("pnpm-workspace.yaml", dirname(dir)) !== undefined;

  const compatibilityDate = options.compatibilityDate ?? new Date().toISOString().slice(0, 10);
  copyTemplate(join(templatesDir, "app"), dir, {
    APP_NAME: name,
    COMPAT_DATE: compatibilityDate,
    PM: packageManager,
  });

  writeJson(join(dir, "package.json"), {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vinext dev",
      build: "vinext build",
      // --persist-to keeps local D1/R2/KV state in the app root, shared with `vinext dev`
      // and `wrangler d1 migrations apply --local` (otherwise it lands in dist/server/.wrangler).
      start: "wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/state",
      deploy: "vinext-cloudflare deploy --config dist/server/wrangler.json",
      "cf-typegen": "wrangler types",
      "db:generate": "drizzle-kit generate",
      "db:migrate:local": "wrangler d1 migrations apply DB --local",
    },
    dependencies: { "@flare/core": coreDependencySpec(dir, packageManager), ...APP_DEPENDENCIES },
    devDependencies: { ...APP_DEV_DEPENDENCIES },
  });

  // Local secrets (git-ignored). Production secrets are set with `wrangler secret put`.
  writeFileSync(join(dir, ".dev.vars"), `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}\n`);

  if (packageManager === "pnpm" && !inWorkspace) {
    // pnpm blocks dependency build scripts unless explicitly allowed.
    writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n  workerd: true\n  sharp: false\n");
  }

  if (options.install !== false) {
    const code = run(packageManager, ["install"], dir);
    if (code !== 0) throw new Error(`${packageManager} install failed (exit code ${code}).`);
    // Generate worker-configuration.d.ts so `env.DB` and other bindings are typed.
    const typegen = run(packageManager, ["run", "cf-typegen"], dir);
    if (typegen !== 0) throw new Error(`wrangler types failed (exit code ${typegen}).`);
  }

  return { dir, name, packageManager, inWorkspace };
}

export function printNextSteps(result: CreateResult, installed: boolean) {
  const rel = relative(process.cwd(), result.dir) || ".";
  const pm = result.packageManager;
  console.log(`\n${pc.green("✔")} Created ${pc.bold(result.name)} in ${rel}\n`);
  console.log("Next steps:");
  console.log(`  cd ${rel}`);
  if (!installed) console.log(`  ${pm} install`);
  console.log(`  ${pm} run dev`);
}
