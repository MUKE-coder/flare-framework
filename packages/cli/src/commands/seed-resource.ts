/**
 * `flare seed:resource <Resource> --count <n>`: fill a table with sample rows built
 * from its descriptor. Local by default, `--remote` for the deployed database.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Resource } from "@flaredev/core";
import pc from "picocolors";
import { loadResources } from "../generator/load.js";
import { openLocalD1, type D1Binding } from "../seed/local-d1.js";
import { bulkInsert, insertStatements, type SqlSink } from "../seed/bulk.js";
import { seedColumns, seedRows, type ParentIds } from "../seed/rows.js";
import { formatCount, formatDuration, formatRate, progressLine } from "../terminal.js";
import { readD1Databases, runWrangler, type D1Database } from "../utils/wrangler.js";
import { findAppRoot, resolveBin } from "./run.js";

export interface SeedResourceOptions {
  count?: number | string;
  remote?: boolean;
  truncate?: boolean;
  /** Same number, same rows. */
  seed?: number;
  /** D1 binding when the app has several databases. */
  database?: string;
  env?: string;
  yes?: boolean;
  cwd?: string;
  log?: (message: string) => void;
  /** Called as rows land, for a progress line. */
  onProgress?: (written: number, total: number) => void;
}

export interface SeedResourceResult {
  resource: Resource;
  rows: number;
  ms: number;
  where: "local" | "remote";
}

/** How many rows the table already holds, so numbering carries on from there. */
async function countRows(db: { prepare(sql: string): { first<T>(): Promise<T | null> } }, table: string): Promise<number> {
  const row = await db.prepare(`SELECT count(*) AS total FROM "${table}"`).first<{ total: number }>();
  return row?.total ?? 0;
}

/** Parents to sample ids from; more than this and the spread is already plenty. */
const PARENT_SAMPLE = 5000;

/** "1000", "1,000", "1_000", "25k", "1m" → a number of rows. */
export function parseCount(value: number | string | undefined, fallback = 25): number {
  if (value === undefined || value === "") return fallback;
  if (typeof value === "number") return Math.floor(value);
  const text = String(value).trim().toLowerCase().replaceAll(",", "").replaceAll("_", "").replaceAll(" ", "");
  const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(text);
  if (!match) throw new Error(`"${value}" is not a number of rows. Try 1000, 25k or 1m.`);
  const size = Number(match[1]) * (match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1);
  if (size < 1) throw new Error("Ask for at least one row.");
  return Math.floor(size);
}

function pickResource(resources: Resource[], name: string): Resource {
  const wanted = name.toLowerCase();
  const match = resources.find((resource) => [resource.name.toLowerCase(), resource.slug, resource.table].includes(wanted));
  if (!match) {
    throw new Error(`No resource "${name}". Available: ${resources.map((resource) => resource.name).join(", ") || "none"}.`);
  }
  return match;
}

function pickDatabase(databases: D1Database[], wanted?: string): D1Database {
  if (databases.length === 0) throw new Error("No d1_databases in wrangler.jsonc.");
  if (wanted) {
    const match = databases.find((db) => db.binding === wanted || db.database_name === wanted);
    if (!match) throw new Error(`No D1 database "${wanted}". Available: ${databases.map((db) => db.binding).join(", ")}.`);
    return match;
  }
  if (databases.length > 1) throw new Error(`Several D1 databases; pick one with --database (${databases.map((db) => db.binding).join(", ")}).`);
  return databases[0]!;
}

/** Resources this one belongs to, and the ids available to point at. */
async function parentsOf(resource: Resource, all: Resource[], ids: (table: string) => Promise<string[]>): Promise<ParentIds> {
  const targets = new Set(
    Object.values(resource.fields)
      .filter((field) => field.kind === "belongsTo")
      .map((field) => (field as { target: string }).target),
  );
  const parents: ParentIds = new Map();
  for (const target of targets) {
    const parent = all.find((candidate) => candidate.name === target);
    if (parent) parents.set(target, await ids(parent.table));
  }
  return parents;
}

/** `flare seed:resource`, with a progress line and a summary. */
export async function seedResourceCommand(name: string, options: SeedResourceOptions = {}): Promise<SeedResourceResult> {
  const progress = progressLine();
  const started = Date.now();
  try {
    const result = await seedResource(name, {
      ...options,
      onProgress: (written, total) => {
        const elapsed = Date.now() - started;
        progress.update(`  ${pc.cyan(formatCount(written))} of ${formatCount(total)} rows  ${pc.dim(formatRate(written, elapsed))}`);
      },
    });
    progress.done();
    const { rows, ms, where } = result;
    console.log(
      `${pc.green("✔")} Seeded ${pc.bold(formatCount(rows))} ${result.resource.pluralLabel.toLowerCase()} into the ${where} database ` +
        pc.dim(`(${formatDuration(ms)}, ${formatRate(rows, ms)})`),
    );
    return result;
  } catch (error) {
    progress.done();
    throw error;
  }
}

export async function seedResource(name: string, options: SeedResourceOptions = {}): Promise<SeedResourceResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const resources = (await loadResources(appRoot)).map(({ resource }) => resource);
  const resource = pickResource(resources, name);
  const total = parseCount(options.count);
  const where = options.remote ? "remote" : "local";

  if (options.remote && !options.yes) {
    throw new Error(`Seeding the remote database writes ${total.toLocaleString()} rows to ${resource.table}. Re-run with --yes to confirm.`);
  }

  const columns = seedColumns(resource);
  const started = Date.now();
  let parents: ParentIds = new Map();
  // Numbering carries on from the rows already there, so a second run doesn't repeat
  // the first run's unique values.
  let startIndex = 0;
  const rows = () => seedRows(resource, total, { seed: options.seed, parentIds: parents, startIndex });

  if (options.remote) {
    const db = pickDatabase(readD1Databases(appRoot), options.database);
    const wrangler = resolveBin(appRoot, "wrangler", "wrangler");
    const target = ["--remote", ...(options.env ? ["--env", options.env] : [])];
    const query = async <T,>(sql: string): Promise<T[]> => {
      const result = await runWrangler(wrangler, ["d1", "execute", db.binding, ...target, "--json", "--command", sql], appRoot, { capture: true });
      if (result.code !== 0) throw new Error(`Query failed on the remote database:\n${result.output.trim()}`);
      const start = result.output.indexOf("[");
      const parsed = JSON.parse(result.output.slice(start, result.output.lastIndexOf("]") + 1)) as { results: T[] }[];
      return parsed[0]?.results ?? [];
    };
    parents = await parentsOf(resource, resources, async (table) => {
      const found = await query<{ id: string }>(`SELECT id FROM "${table}" LIMIT ${PARENT_SAMPLE}`);
      return found.map((row) => row.id);
    });
    if (!options.truncate) {
      const [counted] = await query<{ total: number }>(`SELECT count(*) AS total FROM "${resource.table}"`);
      startIndex = counted?.total ?? 0;
    }

    // One file, uploaded once: D1's import path is far quicker than a query per batch.
    const dir = mkdtempSync(join(tmpdir(), "flare-seed-"));
    const file = join(dir, `${resource.table}.sql`);
    try {
      const statements: string[] = [];
      if (options.truncate) statements.push(`DELETE FROM "${resource.table}";`);
      let written = 0;
      for (const statement of insertStatements(resource.table, columns, rows())) {
        statements.push(statement.sql);
        written += statement.rows;
        options.onProgress?.(written, total);
      }
      writeFileSync(file, statements.join("\n"));
      log(`${pc.cyan("●")} Uploading ${total.toLocaleString()} rows to ${pc.bold(db.database_name)}`);
      const result = await runWrangler(wrangler, ["d1", "execute", db.binding, ...target, "--yes", "--file", file], appRoot, { capture: true });
      if (result.code !== 0) throw new Error(`Seeding the remote database failed:\n${result.output.trim()}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return { resource, rows: total, ms: Date.now() - started, where };
  }

  const local = await openLocalD1(appRoot, options.database);
  try {
    parents = await parentsOf(resource, resources, async (table) => {
      const found = await local.db.prepare(`SELECT id FROM "${table}" LIMIT ${PARENT_SAMPLE}`).all<{ id: string }>();
      return (found.results ?? []).map((row) => row.id);
    });
    if (options.truncate) await local.db.exec(`DELETE FROM "${resource.table}";`);
    else startIndex = await countRows(local.db, resource.table);
    const sink: SqlSink = { exec: (sql) => (local.db as D1Binding).exec(sql) };
    const written = await bulkInsert(sink, {
      table: resource.table,
      columns,
      rows: rows(),
      onProgress: (count) => options.onProgress?.(count, total),
    });
    return { resource, rows: written, ms: Date.now() - started, where };
  } finally {
    await local.dispose();
  }
}
