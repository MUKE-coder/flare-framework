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
/**
 * The same four verbs on the Next.js stack.
 *
 * `flare deploy` is the Vercel CLI: it uploads the project, builds it on Vercel and
 * promotes it. Everything it needs — the build command, the environment variables, the
 * project link — lives in the Vercel project rather than here, which is why there is no
 * equivalent of the Cloudflare deploy's migrate-and-secrets dance. Migrations are
 * `flare migrate` against the production DATABASE_URL, run deliberately.
 */
const NEXT_COMMANDS: Record<DelegatedCommand, { pkg: string; bin: string; args: string[] }> = {
  dev: { pkg: "next", bin: "next", args: ["dev"] },
  build: { pkg: "next", bin: "next", args: ["build"] },
  start: { pkg: "next", bin: "next", args: ["start"] },
  deploy: { pkg: "vercel", bin: "vercel", args: ["deploy", "--prod"] },
};

export function delegatedArgv(appRoot: string, command: DelegatedCommand, forwarded: string[]): string[] {
  const spec = readStack(appRoot) === "next" ? NEXT_COMMANDS[command] : DELEGATED_COMMANDS[command];
  return [resolveBin(appRoot, spec.pkg, spec.bin), ...spec.args, ...forwarded];
}

/** Run a package's bin with our own Node, inheriting stdio. */
export function runNode(argv: string[], cwd: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    // Running the bin's JS with our own Node avoids the shell (and Windows .cmd shims),
    // so forwarded arguments keep their exact values.
    const child = spawn(process.execPath, argv, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolvePromise(code ?? (signal ? 1 : 0)));
  });
}

/**
 * Like {@link runNode}, but keeps a copy of what the child printed.
 *
 * Output is still mirrored, so the command looks the same. The copy is for the cases where
 * the tool's own last word is the wrong advice: `prisma migrate dev` ends a drift report
 * with "you may use prisma migrate reset … All data will be lost", and the caller wants to
 * answer that rather than leave it as the final line.
 */
export function runNodeCapturing(argv: string[], cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, argv, { cwd, stdio: ["inherit", "pipe", "pipe"] });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        process.stdout.write(chunk);
      });
    }
    child.on("error", reject);
    child.on("exit", (code, signal) => resolvePromise({ code: code ?? (signal ? 1 : 0), output }));
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
  const next = readStack(appRoot) === "next";
  const tunnel = (command === "dev" || command === "start") && forwarded.includes("--tunnel");
  if (tunnel) forwarded = forwarded.filter((arg) => arg !== "--tunnel");
  const wantsHelp = forwarded.includes("--help") || forwarded.includes("-h");

  // `next build` regenerates nothing by itself, and a Prisma client left behind by an
  // older schema fails the type-check rather than the query. The app's own build script
  // does the same two steps, so both routes behave alike.
  if (next && command === "build" && !wantsHelp) {
    const code = await runNode([resolveBin(appRoot, "prisma", "prisma"), "generate"], appRoot);
    if (code !== 0) return code;
  }

  const built = next ? ".next" : "dist/server/wrangler.json";
  if (command === "start" && !wantsHelp && !existsSync(join(appRoot, built))) {
    console.log("No production build found; running `flare build` first.\n");
    // Through this function rather than the bin, so the build is the same one `flare
    // build` runs — Prisma's generate included.
    const code = await runDelegated("build", [], appRoot);
    if (code !== 0) return code;
  }

  if (command === "deploy") {
    // The Cloudflare deploy migrates D1, pushes secrets and applies zone rules first.
    // On Vercel every one of those is the platform's, so this is just the CLI.
    if (next) return runNode(delegatedArgv(appRoot, "deploy", forwarded), appRoot);
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
