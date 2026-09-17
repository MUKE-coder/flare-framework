import { existsSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { relationGraph } from "@flare/core";
import pc from "picocolors";
import { descriptorPath, renderDescriptor, resourceName } from "../generator/descriptor.js";
import { loadResources } from "../generator/load.js";
import { hashBlock, splitMarkers } from "../generator/markers.js";
import { generateSchemaMigration } from "../generator/migrations.js";
import { applyPlan, findOrphans, logResults, planFiles, resourceHeader } from "../generator/plan.js";
import { tableExport } from "../generator/render.js";
import { findAppRoot } from "./run.js";

export interface RmResourceOptions {
  cwd?: string;
  /** Delete even when files contain hand-written code. */
  force?: boolean;
  skipMigration?: boolean;
  log?: (message: string) => void;
}

export interface HandWrittenFinding {
  path: string;
  reason: string;
}

const squash = (text: string) => text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();

/** Why a generated file can't be deleted safely, or null when it only holds generated code. */
export function handWrittenReason(source: string, header: string, options: { descriptorWrapper?: { before: string; after: string } } = {}): string | null {
  const parts = splitMarkers(source);
  if (!parts) return "has no generated block (entirely hand-written)";
  if (options.descriptorWrapper) {
    if (squash(parts.before) !== squash(options.descriptorWrapper.before) || squash(parts.after) !== squash(options.descriptorWrapper.after)) {
      return "has hand-written changes outside the fields block";
    }
    return null;
  }
  const outside = squash(parts.before.replace(header, "") + parts.after);
  if (outside) return "has hand-written code outside the generated block";
  if (parts.hash && hashBlock(parts.block) !== parts.hash) return "has hand edits inside the generated block";
  return null;
}

function removeEmptyDirs(appRoot: string, start: string) {
  let dir = dirname(join(appRoot, start));
  const stop = join(appRoot, "app", "api");
  while (dir.startsWith(stop) && dir !== stop && existsSync(dir) && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    dir = dirname(dir);
  }
}

/** `flare rm resource <Name>` */
export async function rmResource(rawName: string, options: RmResourceOptions = {}): Promise<{ removed: string[]; migrations: string[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const name = resourceName(rawName);
  const all = await loadResources(appRoot);
  const entry = all.find(({ resource }) => resource.name === name);
  const remaining = all.filter(({ resource }) => resource.name !== name);

  // Other resources that still point here would break.
  if (entry) {
    const graph = relationGraph(all.map(({ resource }) => resource));
    const dependents: string[] = [];
    for (const other of remaining) {
      const relations = graph.byResource[other.resource.name]!;
      for (const relation of relations.belongsTo) if (relation.target === name) dependents.push(`${other.resource.name}.${relation.key}`);
      for (const relation of relations.hasMany) if (relation.target === name) dependents.push(`${other.resource.name}.${relation.key}`);
    }
    for (const pending of graph.pending) if (pending.target === name) dependents.push(`${pending.resource}.${pending.key}`);
    if (dependents.length) {
      throw new Error(`Can't remove ${name}: ${dependents.join(", ")} still reference${dependents.length === 1 ? "s" : ""} it. Remove those fields first.`);
    }
  }

  // Everything this resource owns: its planned files (if the descriptor exists) plus orphans with its header.
  const owned = new Set<string>();
  if (entry) {
    owned.add(entry.file);
    for (const file of planFiles(all)) {
      if (existsSync(join(appRoot, file.path)) && file.header === resourceHeader(name)) owned.add(file.path);
    }
  }
  for (const orphan of findOrphans(appRoot, remaining)) if (orphan.resource === name) owned.add(orphan.path);
  if (!entry && owned.size === 0) throw new Error(`No resource "${name}" (no ${descriptorPath(name)} and no generated files).`);

  const findings: HandWrittenFinding[] = [];
  for (const path of owned) {
    const source = readFileSync(join(appRoot, path), "utf8");
    let wrapper: { before: string; after: string } | undefined;
    if (entry && path === entry.file) {
      const standard = splitMarkers(renderDescriptor(name, [{ key: "placeholder", kind: "string", required: true, unique: false }]))!;
      wrapper = { before: standard.before, after: standard.after };
    }
    const reason = handWrittenReason(source, resourceHeader(name), { descriptorWrapper: wrapper });
    if (reason) findings.push({ path, reason });
  }
  if (findings.length && !options.force) {
    const list = findings.map((finding) => `  ${finding.path}: ${finding.reason}`).join("\n");
    throw new Error(`Refusing to remove ${name}; these files contain hand-written code:\n${list}\nMove what you want to keep, or pass --force to delete anyway.`);
  }

  const removed = [...owned].sort();
  for (const path of removed) {
    unlinkSync(join(appRoot, path));
    removeEmptyDirs(appRoot, path);
    log(`${pc.red("remove".padEnd(9))} ${path}`);
  }

  logResults(applyPlan(appRoot, planFiles(remaining)), log);

  const table = entry ? tableExport(entry.resource) : undefined;
  if (table && existsSync(join(appRoot, "seeds"))) {
    const seeds = readdirSync(join(appRoot, "seeds")).filter((file) =>
      new RegExp(`\\b${table}\\b`).test(readFileSync(join(appRoot, "seeds", file), "utf8")),
    );
    if (seeds.length) log(pc.yellow(`\nThese seeds still use ${table}: ${seeds.map((s) => `seeds/${s}`).join(", ")}.`));
  }

  let migrations: string[] = [];
  if (!options.skipMigration && entry) {
    migrations = (await generateSchemaMigration(appRoot, `drop_${entry.resource.table}`)).files;
    for (const file of migrations) log(`${pc.green("create".padEnd(9))} ${file}`);
    if (migrations.length) log(`\nNext: ${pc.bold("flare migrate")} to drop the table locally.`);
  }
  return { removed, migrations };
}

