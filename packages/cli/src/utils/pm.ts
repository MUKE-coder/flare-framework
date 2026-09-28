import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

const MANAGERS: PackageManager[] = ["pnpm", "npm", "yarn", "bun"];

export function isPackageManager(value: unknown): value is PackageManager {
  return MANAGERS.includes(value as PackageManager);
}

/** Detect the package manager that invoked us (e.g. `pnpm dlx`, `npx`), defaulting to pnpm. */
export function detectPackageManager(userAgent = process.env.npm_config_user_agent ?? ""): PackageManager {
  const name = userAgent.split("/")[0];
  return isPackageManager(name) ? name : "pnpm";
}

/**
 * Whether a package manager is on PATH.
 *
 * Looked up on disk rather than run. `pnpm --version` takes seven seconds on a machine
 * where pnpm is running through Node, and `flare create` asks this question before it
 * prints anything — seven seconds of silence for an answer that is a directory listing.
 */
export function isInstalled(packageManager: PackageManager): boolean {
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  // On Windows the executable is pnpm.cmd or pnpm.exe, named by PATHEXT.
  const suffixes = process.platform === "win32" ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";") : [""];
  return dirs.some((dir) => suffixes.some((suffix) => existsSync(join(dir, packageManager + suffix.toLowerCase()))));
}

/**
 * Which package manager to install a new app with.
 *
 * `--pm` wins. Otherwise pnpm, whenever it is installed — including when npm or yarn
 * started us, which is the common case because the documented command is
 * `npm create flare-framework`. This is not a preference about tooling: a Flare app is
 * around 340 packages with a Workers runtime or Next and Prisma inside it, and npm
 * takes minutes over pnpm's seconds on the same machine. The choice is printed, with
 * how to override it, rather than made quietly.
 */
export function choosePackageManager(explicit?: string): { packageManager: PackageManager; preferred: boolean } {
  if (explicit !== undefined) {
    if (!isPackageManager(explicit)) throw new Error(`Unknown package manager "${explicit}". Use pnpm, npm, yarn, or bun.`);
    return { packageManager: explicit, preferred: false };
  }
  const detected = detectPackageManager();
  if (detected !== "pnpm" && isInstalled("pnpm")) return { packageManager: "pnpm", preferred: true };
  return { packageManager: detected, preferred: false };
}

/**
 * Run a command with inherited stdio; returns the exit code. Arguments must be
 * CLI-controlled values, not user input: on Windows they go through the shell.
 */
export function run(command: string, args: string[], cwd: string): number {
  const env = childEnv();
  // Package managers are .cmd shims on Windows and can't be spawned without a shell.
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].join(" "), { cwd, stdio: "inherit", shell: true, env })
      : spawnSync(command, args, { cwd, stdio: "inherit", env });
  return result.status ?? 1;
}

/**
 * Settings `npm exec` / `npm create` export to the process it runs, which would leak
 * into a nested `npm install` as if passed on its command line. npm 11 refuses
 * `allow-scripts` there ("not allowed in project-scoped installs"); the rest belong
 * to the outer exec only. Everything else (registry, cache, auth) is kept.
 */
const EXEC_ONLY_CONFIG = ["npm_config_allow_scripts", "npm_config_yes", "npm_config_call", "npm_config_package"];

export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of Object.keys(next)) {
    if (EXEC_ONLY_CONFIG.includes(key.toLowerCase())) delete next[key];
  }
  return next;
}

/** Like run(), but captures the output instead of printing it (shown only if something fails). */
export function runQuiet(command: string, args: string[], cwd: string): { code: number; output: string } {
  const env = childEnv();
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].join(" "), { cwd, env, shell: true, encoding: "utf8" })
      : spawnSync(command, args, { cwd, env, encoding: "utf8" });
  return { code: result.status ?? 1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/**
 * `install` for each manager, without the noise that isn't about this install:
 * npm's audit/funding summaries and warnings (errors still print).
 */
export function installArgs(pm: PackageManager): string[] {
  if (pm === "npm") return ["install", "--no-audit", "--no-fund", "--loglevel=error"];
  return ["install"];
}
