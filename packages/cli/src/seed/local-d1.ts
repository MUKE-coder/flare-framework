/**
 * The local D1 database, through wrangler's platform proxy — the same state
 * `flare dev`, `flare start` and `flare migrate` use.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
  // wrangler's banner and its warnings about Durable Objects aren't about seeding.
  process.env.WRANGLER_LOG ??= "error";
  const appRequire = createRequire(join(appRoot, "package.json"));
  const wrangler = (await import(pathToFileURL(appRequire.resolve("wrangler")).href)) as WranglerModule;
  const { env, dispose } = await wrangler.getPlatformProxy({
    configPath: join(appRoot, "wrangler.jsonc"),
    persist: { path: join(appRoot, LOCAL_STATE) },
  });
  const bindings = env as Record<string, unknown>;
  const name = binding ?? "DB";
  const db = bindings[name];
  if (!db) {
    const available = Object.keys(bindings).filter((key) => typeof (bindings[key] as D1Binding)?.prepare === "function");
    throw new Error(`No "${name}" database binding in wrangler.jsonc.${available.length ? ` Available: ${available.join(", ")}.` : ""}`);
  }
  return { db: db as D1Binding, env: bindings, dispose };
}
