import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { camelCase, defineResource, relationGraph, type Resource } from "@flare/core";
import pc from "picocolors";
import { descriptorPath, renderDescriptor, renderFieldsBlock, resourceName, toField } from "../generator/descriptor.js";
import { parseFields, type ParsedField } from "../generator/grammar.js";
import { loadResources } from "../generator/load.js";
import { DriftError, writeGenerated } from "../generator/markers.js";
import { generateSchemaMigration } from "../generator/migrations.js";
import { applyPlan, ensureSupportFiles, logResults, planFiles, type FileResult } from "../generator/plan.js";
import { findAppRoot } from "./run.js";

export interface GenResourceOptions {
  fields?: string;
  cwd?: string;
  /** Overwrite hand-edited generated blocks (including the descriptor's fields). */
  force?: boolean;
  /** Skip running drizzle-kit (tests without an installed app). */
  skipMigration?: boolean;
  log?: (message: string) => void;
}

export interface GenResult {
  name: string;
  /** "create" for a new resource, "update" when re-run for an existing one. */
  mode: "create" | "update";
  written: FileResult[];
  migrations: string[];
}

function validateFields(name: string, fields: ParsedField[], others: Resource[], log: (message: string) => void) {
  const known = new Set([name, ...others.map((resource) => resource.name)]);
  for (const field of fields) {
    if (field.kind === "belongsTo" && !known.has(field.target!)) {
      throw new Error(`${name}.${field.key} belongs to "${field.target}", which doesn't exist yet. Generate ${field.target} first.`);
    }
  }
  const candidate = defineResource({ name, fields: Object.fromEntries(fields.map((f) => [f.key, toField(f)])) });
  const graph = relationGraph([...others, candidate]);
  for (const pending of graph.pending.filter((p) => p.resource === name)) {
    log(pc.dim(`note: ${name}.${pending.key} will link up once ${pending.target} exists (give it a ${camelCase(name)}Id: belongsTo(${name}) field).`));
  }
}

/**
 * `flare gen resource <Name> [--fields …]`
 *
 * New resource: writes the descriptor, every derived file, and a create migration.
 * Existing resource: with --fields, replaces the descriptor's generated fields block
 * (refused if it was edited by hand, unless --force); either way it regenerates derived
 * files and writes an update migration if the table changed. Code outside generated
 * blocks is never touched.
 */
export async function genResource(rawName: string, options: GenResourceOptions): Promise<GenResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const name = resourceName(rawName);
  const relativePath = descriptorPath(name);
  const path = join(appRoot, relativePath);
  const exists = existsSync(path);

  if (!exists && !options.fields) {
    throw new Error(`--fields is required, e.g. flare gen resource ${name} --fields "name:string, email:string"`);
  }

  const existing = await loadResources(appRoot);
  const others = existing.filter(({ resource }) => resource.name !== name).map(({ resource }) => resource);

  if (options.fields) {
    // Validate everything before writing anything.
    const fields = parseFields(options.fields);
    validateFields(name, fields, others, log);

    if (!exists) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, renderDescriptor(name, fields));
      log(`${pc.green("create".padEnd(9))} ${relativePath}`);
    } else {
      try {
        const outcome = writeGenerated(path, renderFieldsBlock(fields), { force: options.force });
        log(`${(outcome === "identical" ? pc.dim : pc.yellow)(outcome.padEnd(9))} ${relativePath}`);
      } catch (error) {
        if (error instanceof DriftError) {
          throw new Error(
            `The fields in ${relativePath} were edited by hand, so --fields won't overwrite them. ` +
              `Edit the descriptor directly and run \`flare gen resource ${name}\` (or \`flare sync-types\`), or pass --force.`,
          );
        }
        throw error;
      }
    }
  }

  let written: FileResult[];
  let table: string;
  try {
    const all = await loadResources(appRoot);
    table = all.find(({ resource }) => resource.name === name)!.resource.table;
    ensureSupportFiles(appRoot, log);
    written = applyPlan(appRoot, planFiles(all), { force: options.force });
    logResults(written, log);
  } catch (error) {
    const hint = exists ? "" : `\n(${relativePath} was written; fix it and run \`flare sync-types\`.)`;
    throw new Error(`${error instanceof Error ? error.message : String(error)}${hint}`);
  }
  const skipped = written.filter((r) => r.outcome.startsWith("skipped"));
  if (skipped.length) {
    log(pc.yellow(`\nSkipped ${skipped.length} hand-edited file(s); run \`flare sync-types\` for details.`));
  }

  let migrations: string[] = [];
  if (!options.skipMigration) {
    const result = await generateSchemaMigration(appRoot, `${exists ? "update" : "create"}_${table}`);
    migrations = result.files;
    for (const file of migrations) log(`${pc.green("create".padEnd(9))} ${file}`);
    if (migrations.length) log(`\nNext: ${pc.bold("flare migrate")} to apply it locally.`);
    else if (exists) log(pc.dim("\nNo table changes, so no migration."));
  }

  const descriptor: FileResult = { path: relativePath, status: exists ? "outdated" : "missing", outcome: exists ? "update" : "create" };
  return { name, mode: exists ? "update" : "create", written: [descriptor, ...written], migrations };
}
