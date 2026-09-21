import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { findUp } from "../utils/fs.js";
import { runDeploy } from "./deploy.js";

/**
 * `flare dev` / `build` / `start` / `deploy` delegate to the app's own vinext and
 * wrangler installs. Anything after the command name is forwarded unchanged.
 */
export const DELEGATED_COMMANDS = {
  dev: { description: "Start the vinext dev server", pkg: "vinext", bin: "vinext", args: ["dev"] },
  build: { description: "Build for production (vinext build)", pkg: "vinext", bin: "vinext", args: ["build"] },
  start: {
    description: "Serve the production build locally in workerd (builds first if needed)",
    pkg: "wrangler",
    bin: "wrangler",
    // --persist-to shares local D1/R2 state with `flare dev` and local migrations.
    args: ["dev", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state"],
  },
  deploy: {
    description:
      "Migrate D1, build and deploy to Cloudflare Workers (vinext-cloudflare deploy), then ensure secrets and push security.config.ts zone rules. Flags: --skip-migrations, --skip-secrets, --skip-security",
    pkg: "@vinext/cloudflare",
    bin: "vinext-cloudflare",
    args: ["deploy", "--config", "dist/server/wrangler.json"],
  },
} as const;

export type DelegatedCommand = keyof typeof DELEGATED_COMMANDS;

export function isDelegatedCommand(value: string | undefined): value is DelegatedCommand {
  return value !== undefined && Object.hasOwn(DELEGATED_COMMANDS, value);
}

/** The nearest directory at or above `cwd` whose package.json depends on vinext. */
export function findAppRoot(cwd: string): string {
  let dir: string | undefined = resolve(cwd);
  while (dir) {
    const root: string | undefined = findUp("package.json", dir);
    if (!root) break;
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (pkg.dependencies?.vinext || pkg.devDependencies?.vinext) return root;
    const parent = dirname(root);
    dir = parent === root ? undefined : parent;
  }
  throw new Error("Not inside a Flare app (no package.json depending on vinext found). Run this from your app directory.");
}

/** Absolute path to a package's bin script, resolved from the app's node_modules (works with pnpm symlinks). */
export function resolveBin(appRoot: string, pkgName: string, binName: string): string {
  const pkgDir = findUp(join("node_modules", pkgName, "package.json"), appRoot);
  if (!pkgDir) {
    throw new Error(`Cannot find ${pkgName} in ${appRoot}. Install dependencies first (e.g. pnpm install).`);
  }
  const manifestPath = join(pkgDir, "node_modules", pkgName, "package.json");
  const { bin } = JSON.parse(readFileSync(manifestPath, "utf8")) as { bin?: string | Record<string, string> };
  const relativeBin = typeof bin === "string" ? bin : bin?.[binName];
  if (!relativeBin) throw new Error(`${pkgName} does not provide a "${binName}" executable.`);
  return join(dirname(manifestPath), relativeBin);
}

/** The full argv (after `node`) a delegated command runs, e.g. [".../vinext/dist/cli.js", "dev", "--port", "4000"]. */
export function delegatedArgv(appRoot: string, command: DelegatedCommand, forwarded: string[]): string[] {
  const spec = DELEGATED_COMMANDS[command];
  return [resolveBin(appRoot, spec.pkg, spec.bin), ...spec.args, ...forwarded];
}

function runNode(argv: string[], cwd: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    // Running the bin's JS with our own Node avoids the shell (and Windows .cmd shims),
    // so forwarded arguments keep their exact values.
    const child = spawn(process.execPath, argv, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolvePromise(code ?? (signal ? 1 : 0)));
  });
}

export async function runDelegated(command: DelegatedCommand, forwarded: string[], cwd = process.cwd()): Promise<number> {
  const appRoot = findAppRoot(cwd);
  const wantsHelp = forwarded.includes("--help") || forwarded.includes("-h");

  if (command === "start" && !wantsHelp && !existsSync(join(appRoot, "dist/server/wrangler.json"))) {
    console.log("No production build found; running `flare build` first.\n");
    const code = await runNode(delegatedArgv(appRoot, "build", []), appRoot);
    if (code !== 0) return code;
  }

  if (command === "deploy") {
    return runDeploy(forwarded, {
      appRoot,
      wranglerBin: resolveBin(appRoot, "wrangler", "wrangler"),
      deploy: (args) => runNode(delegatedArgv(appRoot, "deploy", args), appRoot),
    });
  }

  return runNode(delegatedArgv(appRoot, command, forwarded), appRoot);
}
