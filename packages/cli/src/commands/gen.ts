import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { camelCase, defineResource, relationGraph } from "@flare/core";
import pc from "picocolors";
import { descriptorPath, renderDescriptor, resourceName, toField } from "../generator/descriptor.js";
import { parseFields } from "../generator/grammar.js";
import { loadResources } from "../generator/load.js";
import { generateSchemaMigration } from "../generator/migrations.js";
import { applyPlan, ensureSupportFiles, logResults, planFiles, type FileResult } from "../generator/plan.js";
import { findAppRoot } from "./run.js";

export interface GenResourceOptions {
  fields?: string;
  cwd?: string;
  /** Skip running drizzle-kit (tests without an installed app). */
  skipMigration?: boolean;
  log?: (message: string) => void;
}

export interface GenResult {
  name: string;
  written: FileResult[];
  migrations: string[];
}

export async function genResource(rawName: string, options: GenResourceOptions): Promise<GenResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const name = resourceName(rawName);
  if (!options.fields) throw new Error(`--fields is required, e.g. flare gen resource ${name} --fields "name:string, email:string"`);

  const fields = parseFields(options.fields);
  const relativePath = descriptorPath(name);
  const path = join(appRoot, relativePath);
  if (existsSync(path)) {
    throw new Error(`${relativePath} already exists. Edit the descriptor directly, then run \`flare sync-types\`.`);
  }

  // Validate relations against the existing resources before writing anything.
  const existing = await loadResources(appRoot);
  const known = new Set([name, ...existing.map(({ resource }) => resource.name)]);
  for (const field of fields) {
    if (field.kind === "belongsTo" && !known.has(field.target!)) {
      throw new Error(`${name}.${field.key} belongs to "${field.target}", which doesn't exist yet. Generate ${field.target} first.`);
    }
  }
  const candidate = defineResource({ name, fields: Object.fromEntries(fields.map((f) => [f.key, toField(f)])) });
  const graph = relationGraph([...existing.map(({ resource }) => resource), candidate]);
  for (const pending of graph.pending.filter((p) => p.resource === name)) {
    log(pc.dim(`note: ${name}.${pending.key} will link up once ${pending.target} exists (give it a ${camelCase(name)}Id: belongsTo(${name}) field).`));
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderDescriptor(name, fields));
  log(`${pc.green("create".padEnd(9))} ${relativePath}`);

  let written: FileResult[];
  let table: string;
  try {
    const all = await loadResources(appRoot);
    table = all.find(({ resource }) => resource.name === name)!.resource.table;
    ensureSupportFiles(appRoot, log);
    written = applyPlan(appRoot, planFiles(all));
    logResults(written, log);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n(${relativePath} was written; fix it and run \`flare sync-types\`.)`);
  }
  const drift = written.filter((r) => r.outcome.startsWith("skipped"));
  if (drift.length) {
    log(pc.yellow(`\nSkipped ${drift.length} hand-edited file(s); run \`flare sync-types\` for details.`));
  }

  let migrations: string[] = [];
  if (!options.skipMigration) {
    const result = await generateSchemaMigration(appRoot, `create_${table}`);
    migrations = result.files;
    for (const file of migrations) log(`${pc.green("create".padEnd(9))} ${file}`);
    if (migrations.length) log(`\nNext: ${pc.bold("flare migrate")} to apply it locally.`);
  }

  return { name, written: [{ path: relativePath, status: "missing", outcome: "create" }, ...written], migrations };
}
