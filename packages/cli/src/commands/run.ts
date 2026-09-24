import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import pc from "picocolors";
import { openTunnel, parseLocalUrl, tunnelBanner, type Tunnel } from "../tunnel.js";
import { findUp } from "../utils/fs.js";
import { runDeploy } from "./deploy.js";
import { readStack } from "../stack.js";

/**
 * `flare dev` / `build` / `start` / `deploy` delegate to the app's own vinext and
 * wrangler installs. Anything after the command name is forwarded unchanged.
 */
export const DELEGATED_COMMANDS = {
  dev: { description: "Start the vinext dev server (--tunnel: also share it on a public URL)", pkg: "vinext", bin: "vinext", args: ["dev"] },
  build: { description: "Build for production (vinext build)", pkg: "vinext", bin: "vinext", args: ["build"] },
  start: {
    description: "Serve the production build locally in workerd, building first if needed (--tunnel: also share it on a public URL)",
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

/**
 * The nearest directory at or above `cwd` that is a Flare app.
 *
 * Recognised by `@flaredev/core`, which both stacks depend on — a Next.js app has no
 * vinext in it, and looking for that would leave half of them unrecognised.
 */
export function findAppRoot(cwd: string): string {
  let dir: string | undefined = resolve(cwd);
  while (dir) {
    const root: string | undefined = findUp("package.json", dir);
    if (!root) break;
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["@flaredev/core"] || deps.vinext) return root;
    const parent = dirname(root);
    dir = parent === root ? undefined : parent;
  }
  throw new Error("Not inside a Flare app (no package.json depending on @flaredev/core found). Run this from your app directory.");
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
  if (readStack(appRoot) === "next") {
    // These four wrap vinext and wrangler, which a Next.js app doesn't have. Its own
    // scripts are the ones to run, and saying so beats a missing-binary error.
    const script = { dev: "npm run dev", build: "npm run build", start: "npm start", deploy: "npm run deploy" }[command];
    throw new Error(`\`flare ${command}\` is for the Cloudflare stack. This app targets Next.js — run \`${script}\` instead.`);
  }
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

/**
 * Run a dev server with its output mirrored, and share it on a Cloudflare quick tunnel
 * once it prints the address it's listening on. With `opened`, the tunnel already exists
 * (opened first so the server could be told its public origin) and only the banner waits.
 * The tunnel closes with the server.
 */
function runNodeWithTunnel(argv: string[], cwd: string, opened?: Tunnel): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, argv, { cwd, stdio: ["inherit", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" } });
    let tunnel: Tunnel | undefined = opened;
    let seen = "";
    let announced = false;
    const watch = (chunk: Buffer, out: NodeJS.WriteStream) => {
      out.write(chunk);
      if (announced) return;
      seen += chunk.toString();
      const local = parseLocalUrl(seen);
      if (!local) return;
      announced = true;
      if (opened) {
        process.stdout.write(tunnelBanner(opened.url, local));
        return;
      }
      openTunnel(local).then(
        (fresh) => {
          tunnel = fresh;
          if (child.exitCode !== null) fresh.close();
          else process.stdout.write(tunnelBanner(fresh.url, local));
        },
        (error: Error) => process.stderr.write(pc.red(`\nThe tunnel couldn't start: ${error.message}\nThe server is still running locally.\n`)),
      );
    };
    child.stdout!.on("data", (chunk: Buffer) => watch(chunk, process.stdout));
    child.stderr!.on("data", (chunk: Buffer) => watch(chunk, process.stderr));
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      tunnel?.close();
      resolvePromise(code ?? (signal ? 1 : 0));
    });
  });
}

/** The value of `--port <n>` / `--port=<n>` in forwarded args, if any. */
export function portArg(args: string[]): string | undefined {
  const index = args.findIndex((arg) => arg === "--port" || arg === "-p");
  if (index !== -1) return args[index + 1];
  return args.find((arg) => arg.startsWith("--port="))?.slice("--port=".length);
}

export async function runDelegated(command: DelegatedCommand, forwarded: string[], cwd = process.cwd()): Promise<number> {
  const appRoot = findAppRoot(cwd);
  const tunnel = (command === "dev" || command === "start") && forwarded.includes("--tunnel");
  if (tunnel) forwarded = forwarded.filter((arg) => arg !== "--tunnel");
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

  if (tunnel && !wantsHelp && command === "start") {
    // wrangler dev rewrites request URLs to its own address, so auth would see a different
    // origin than the browser's. Open the tunnel first and hand wrangler the public origin.
    const opened = await openTunnel(`http://127.0.0.1:${portArg(forwarded) ?? "8787"}`);
    const origin = ["--local-upstream", new URL(opened.url).host, "--upstream-protocol", "https"];
    return runNodeWithTunnel(delegatedArgv(appRoot, command, [...forwarded, ...origin]), appRoot, opened);
  }
  if (tunnel && !wantsHelp) return runNodeWithTunnel(delegatedArgv(appRoot, command, forwarded), appRoot);
  return runNode(delegatedArgv(appRoot, command, forwarded), appRoot);
}
