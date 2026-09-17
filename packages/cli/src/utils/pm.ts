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
  // Package managers are .cmd shims on Windows and can't be spawned without a shell.
  const result =
    process.platform === "win32"
      ? spawnSync([command, ...args].join(" "), { cwd, stdio: "inherit", shell: true })
      : spawnSync(command, args, { cwd, stdio: "inherit" });
  return result.status ?? 1;
}
