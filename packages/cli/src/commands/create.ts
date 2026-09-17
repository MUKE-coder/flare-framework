import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import pc from "picocolors";
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
      start: "wrangler dev --config dist/server/wrangler.json",
      deploy: "vinext-cloudflare deploy --config dist/server/wrangler.json",
    },
    dependencies: { ...APP_DEPENDENCIES },
    devDependencies: { ...APP_DEV_DEPENDENCIES },
  });

  if (packageManager === "pnpm" && !inWorkspace) {
    // pnpm blocks dependency build scripts unless explicitly allowed.
    writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n  workerd: true\n  sharp: false\n");
  }

  if (options.install !== false) {
    const code = run(packageManager, ["install"], dir);
    if (code !== 0) throw new Error(`${packageManager} install failed (exit code ${code}).`);
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
