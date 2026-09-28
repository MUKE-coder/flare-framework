/**
 * The local D1 database, through wrangler's platform proxy — the same state
 * `flare dev`, `flare start` and `flare migrate` use.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseJsonc } from "jsonc-parser";

/** The part of the D1 binding seeding uses. */
export interface D1Binding {
  exec(sql: string): Promise<unknown>;
  prepare(sql: string): {
    all<T>(): Promise<{ results?: T[] }>;
    first<T>(): Promise<T | null>;
  };
}

export interface LocalD1 {
  db: D1Binding;
  /** Every local binding and variable (D1, R2, .dev.vars). */
  env: Record<string, unknown>;
  dispose: () => Promise<void>;
}

interface WranglerModule {
  getPlatformProxy(options: { configPath: string; persist: { path: string } }): Promise<{ env: unknown; dispose: () => Promise<void> }>;
}

/** Same local state as `flare dev`, `flare start` and `flare migrate`. */
const LOCAL_STATE = ".wrangler/state/v3";

/**
 * Open the local database. `binding` picks one when the app has several; with one
 * database the binding name doesn't matter.
 */
export async function openLocalD1(appRoot: string, binding?: string): Promise<LocalD1> {
  // wrangler's banner isn't about seeding.
  process.env.WRANGLER_LOG ??= "error";
  const appRequire = createRequire(join(appRoot, "package.json"));
  const wrangler = (await import(pathToFileURL(appRequire.resolve("wrangler")).href)) as WranglerModule;
  const configPath = seedConfig(appRoot);
  const { env, dispose } = await wrangler.getPlatformProxy({
    configPath,
    persist: { path: join(appRoot, LOCAL_STATE) },
  });
  const bindings = env as Record<string, unknown>;
  const name = binding ?? "DB";
  const db = bindings[name];
  if (!db) {
    const available = Object.keys(bindings).filter((key) => typeof (bindings[key] as D1Binding)?.prepare === "function");
    throw new Error(`No "${name}" database binding in wrangler.jsonc.${available.length ? ` Available: ${available.join(", ")}.` : ""}`);
  }
  return {
    db: db as D1Binding,
    env: bindings,
    dispose: async () => {
      await dispose();
      rmSync(configPath, { force: true });
    },
  };
}

/**
 * The app's wrangler config with the Durable Objects taken out, written beside the
 * real one and removed afterwards.
 *
 * `getPlatformProxy` starts workerd with no worker script, so a declared Durable
 * Object class cannot be found and workerd says so — at length, in the middle of a
 * seed, about something the seed does not use. WRANGLER_LOG doesn't reach it because
 * the warning is workerd's, not wrangler's.
 *
 * It sits in the app root rather than a temp folder so that every relative path in
 * the config — migrations_dir especially — still resolves.
 */
function seedConfig(appRoot: string): string {
  const source = join(appRoot, "wrangler.jsonc");
  const config = (parseJsonc(readFileSync(source, "utf8")) ?? {}) as Record<string, unknown>;
  delete config.durable_objects;
  delete config.migrations;
  const path = join(appRoot, ".flare-seed.wrangler.json");
  writeFileSync(path, JSON.stringify(config, null, 2));
  return path;
}
