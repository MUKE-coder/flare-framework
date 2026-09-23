/**
 * Installing dependencies, with something to watch while it happens.
 *
 * The install used to run through `spawnSync`, which blocks Node's event loop — so the
 * spinner beside it never drew a single frame. This spawns it properly and counts what
 * has landed in node_modules against what the lockfile says is coming, which works the
 * same for npm, pnpm, yarn and bun without parsing any of their output.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { childEnv, installArgs, type PackageManager } from "./pm.js";

export interface InstallProgress {
  /** Packages in node_modules so far. */
  installed: number;
  /** What the lockfile expects, or 0 when there's no lockfile to read. */
  expected: number;
  /** 0–100, or undefined when there's nothing to compare against. */
  percent?: number;
  elapsedMs: number;
}

export interface InstallResult {
  code: number;
  /** Everything the package manager printed, for when it fails. */
  output: string;
  ms: number;
}

/** How many packages the lockfile plans to install. */
export function expectedPackages(dir: string): number {
  const npmLock = join(dir, "package-lock.json");
  if (existsSync(npmLock)) {
    try {
      const lock = JSON.parse(readFileSync(npmLock, "utf8")) as { packages?: Record<string, unknown> };
      // The root entry ("") is the app itself.
      return Math.max(0, Object.keys(lock.packages ?? {}).length - 1);
    } catch {
      return 0;
    }
  }
  const pnpmLock = join(dir, "pnpm-lock.yaml");
  if (existsSync(pnpmLock)) {
    try {
      const text = readFileSync(pnpmLock, "utf8");
      const packages = text.slice(text.indexOf("\npackages:"));
      return (packages.match(/\n {2}[^\s:]+:/g) ?? []).length;
    } catch {
      return 0;
    }
  }
  return 0;
}

/** Packages unpacked so far, counting scoped ones properly. */
function installedPackages(dir: string): number {
  const root = join(dir, "node_modules");
  if (!existsSync(root)) return 0;
  let total = 0;
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === ".bin") continue;
      if (entry.name.startsWith("@")) {
        try {
          total += readdirSync(join(root, entry.name)).length;
        } catch {
          // A directory being written as we read it.
        }
      } else if (entry.name !== ".pnpm" && entry.name !== ".vite") {
        total += 1;
      }
    }
  } catch {
    return total;
  }
  return total;
}

/**
 * Run the package manager's install. `onProgress` is called about twice a second with
 * how far along it looks.
 */
export function install(
  packageManager: PackageManager,
  dir: string,
  onProgress?: (progress: InstallProgress) => void,
): Promise<InstallResult> {
  const args = installArgs(packageManager);
  const started = Date.now();
  const expected = expectedPackages(dir);

  return new Promise((resolve, reject) => {
    // Package managers are .cmd shims on Windows and can't be spawned without a shell.
    const child =
      process.platform === "win32"
        ? spawn([packageManager, ...args].join(" "), { cwd: dir, shell: true, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] })
        : spawn(packageManager, args, { cwd: dir, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });

    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => (output += chunk));
    child.stderr?.on("data", (chunk: Buffer) => (output += chunk));

    const timer = onProgress
      ? setInterval(() => {
          const installed = installedPackages(dir);
          onProgress({
            installed,
            expected,
            percent: expected > 0 ? Math.min(99, Math.round((installed / expected) * 100)) : undefined,
            elapsedMs: Date.now() - started,
          });
        }, 500)
      : undefined;

    child.on("error", (error) => {
      clearInterval(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearInterval(timer);
      resolve({ code: code ?? 1, output, ms: Date.now() - started });
    });
  });
}
