import { spawnSync } from "node:child_process";

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
