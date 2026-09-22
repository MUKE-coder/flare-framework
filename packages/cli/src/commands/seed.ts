import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { kebabCase, storedFields, type Resource, type StoredField } from "@flaredev/core";
import { createJiti } from "jiti";
import pc from "picocolors";
import { loadResources } from "../generator/load.js";
import { tableExport } from "../generator/render.js";
import { findAppRoot } from "./run.js";

export interface SeedOptions {
  /** Seed names (file stems) to run; default: every seed, in file-name order. */
  names?: string[];
  cwd?: string;
  log?: (message: string) => void;
}

/** The part of wrangler's Node API we use (resolved from the app at runtime). */
interface WranglerModule {
  getPlatformProxy(options: { configPath: string; persist: { path: string } }): Promise<{ env: unknown; dispose: () => Promise<void> }>;
}

const SEEDS_DIR = "seeds";
/** Same local state as `flare dev`, `flare start` and `flare migrate`. */
const LOCAL_STATE = ".wrangler/state/v3";

export function seedFiles(appRoot: string, names?: string[]): string[] {
  const dir = join(appRoot, SEEDS_DIR);
  const all = existsSync(dir)
    ? readdirSync(dir)
        .filter((file) => file.endsWith(".seed.ts"))
        .sort()
    : [];
  if (!names?.length) return all;
  return names.map((name) => {
    const file = `${name.replace(/\.seed\.ts$/, "")}.seed.ts`;
    if (!all.includes(file)) {
      throw new Error(`No seed "${name}" in ${SEEDS_DIR}/. Available: ${all.map((f) => f.replace(".seed.ts", "")).join(", ") || "none"}.`);
    }
    return file;
  });
}

/** `flare seed [names...]`: run seed files against the local D1 database. */
export async function runSeeds(options: SeedOptions = {}): Promise<void> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const files = seedFiles(appRoot, options.names);
  if (files.length === 0) {
    log(`No seeds found. Create one with ${pc.bold("flare seed:make <name>")}.`);
    return;
  }

  // Load everything from the app itself so versions match what the app runs.
  const jiti = createJiti(join(appRoot, "package.json"), { alias: { "@": appRoot }, moduleCache: false, fsCache: false });
  const appRequire = createRequire(join(appRoot, "package.json"));
  const wrangler = (await import(pathToFileURL(appRequire.resolve("wrangler")).href)) as WranglerModule;
  const { drizzle } = (await jiti.import("drizzle-orm/d1")) as { drizzle: (db: unknown, config: object) => unknown };
  const schema = (await jiti.import(join(appRoot, "db/schema.ts"))) as Record<string, unknown>;

  const { env, dispose } = await wrangler.getPlatformProxy({
    configPath: join(appRoot, "wrangler.jsonc"),
    persist: { path: join(appRoot, LOCAL_STATE) },
  });
  try {
    const bindings = env as Record<string, unknown>;
    if (!bindings.DB) throw new Error("No DB binding found in wrangler.jsonc.");
    const db = drizzle(bindings.DB, { schema });
    for (const file of files) {
      const mod = (await jiti.import(join(appRoot, SEEDS_DIR, file))) as { default?: unknown };
      if (typeof mod.default !== "function") throw new Error(`${SEEDS_DIR}/${file} must \`export default defineSeed(async ({ db }) => { ... })\`.`);
      log(`${pc.cyan("seed")} ${file}`);
      await mod.default({ db, env: bindings, log: (message: string) => log(`  ${message}`) });
    }
    log(pc.green(`\nRan ${files.length} seed(s) against the local database.`));
  } finally {
    await dispose();
  }
}

function sampleValue(key: string, def: StoredField, row: number): string | undefined {
  switch (def.kind) {
    case "string":
      if (def.format === "email") return `\`${kebabCase(key).replace(/-?email$/, "") || "user"}\${i}@example.com\``;
      if (def.format === "url") return `\`https://example.com/\${i}\``;
      if (def.format === "tel") return `\`+1202555\${String(1000 + i).slice(-4)}\``;
      if (def.format === "domain") return `\`example\${i}.com\``;
      if (def.format === "country") return JSON.stringify(["US", "GB", "UG", "KE", "DE"][row % 5]);
      if (def.format === "color") return JSON.stringify("#f2541d");
      if (def.format === "slug") return `\`${kebabCase(def.label ?? key)}-\${i}\``;
      return `\`${def.label} \${i}\``;
    case "text":
      return `"Lorem ipsum dolor sit amet."`;
    case "int":
      return "i";
    case "float":
      return "i * 1.5";
    case "boolean":
      return "i % 2 === 0";
    case "date":
      return "`2026-01-0${i}`";
    case "datetime":
      return "new Date().toISOString()";
    case "enum":
      return JSON.stringify(def.options[row % def.options.length]);
    case "multiselect":
      return JSON.stringify(def.options.slice(0, Math.max(1, def.minItems ?? 1)));
    case "file":
      return undefined;
    case "belongsTo":
      return undefined;
  }
}

/** Seed source for `flare seed:make`, with example rows for `resource` when there is one. */
export function renderSeed(resource: Resource | undefined): string {
  if (!resource) {
    return `import { defineSeed } from "@flaredev/core";

export default defineSeed(async ({ db, log }) => {
  // Insert rows with Drizzle, e.g.:
  // await db.insert(contacts).values([{ name: "Ada", email: "ada@example.com" }]);
  log("nothing to seed yet");
});
`;
  }
  const table = tableExport(resource);
  const lines: string[] = [];
  const todos: string[] = [];
  for (const [key, def] of storedFields(resource)) {
    const value = sampleValue(key, def, 0);
    if (value !== undefined) lines.push(`    ${key}: ${value},`);
    else if (def.required) todos.push(`    // ${key}: TODO (${def.kind === "belongsTo" ? `id of an existing ${def.target}` : "R2 object key"}),`);
  }
  return `import { defineSeed } from "@flaredev/core";
import { ${table} } from "@/db/schema";

export default defineSeed(async ({ db, log }) => {
  const rows = [1, 2, 3].map((i) => ({
${[...lines, ...todos].join("\n")}
  }));
  await db.insert(${table}).values(rows);
  log(\`inserted \${rows.length} ${resource.pluralLabel.toLowerCase()}\`);
});
`;
}

/** `flare seed:make <name> [--resource Name]` */
export async function makeSeed(rawName: string, options: { resource?: string; cwd?: string; log?: (message: string) => void } = {}) {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const name = kebabCase(rawName);
  if (!name) throw new Error(`Invalid seed name "${rawName}".`);
  const relative = `${SEEDS_DIR}/${name}.seed.ts`;
  const path = join(appRoot, relative);
  if (existsSync(path)) throw new Error(`${relative} already exists.`);

  const resources = (await loadResources(appRoot)).map(({ resource }) => resource);
  let resource: Resource | undefined;
  if (options.resource) {
    resource = resources.find((r) => r.name.toLowerCase() === options.resource!.toLowerCase());
    if (!resource) throw new Error(`No resource "${options.resource}". Available: ${resources.map((r) => r.name).join(", ") || "none"}.`);
  } else {
    // Default to a resource whose name matches the seed ("contacts" → Contact), else none.
    resource = resources.find((r) => [kebabCase(r.name), r.slug].includes(name));
  }

  mkdirSync(join(appRoot, SEEDS_DIR), { recursive: true });
  writeFileSync(path, renderSeed(resource));
  log(`${pc.green("create".padEnd(9))} ${relative}`);
  log(`\nRun it with ${pc.bold(`flare seed ${name}`)}.`);
  return relative;
}
