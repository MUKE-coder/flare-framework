/**
 * `flare seed:resource` on the Next.js stack.
 *
 * The Cloudflare path writes SQL straight at D1, because it can: it owns the dialect and
 * the file format D1 imports. Postgres is reached through the app's own Prisma client
 * instead — it is the only thing that knows how this schema maps to the database, and
 * guessing at the literal syntax for a `text[]`, a `jsonb` and a Postgres enum is three
 * chances to be subtly wrong about escaping.
 *
 * That client is TypeScript the app compiles, so this process cannot import it. The same
 * trick the rest of the Next.js commands use applies: write a small runner into the app
 * and execute it with the app's own `tsx`, which is how `flare seed` and
 * `flare user:role` already talk to Postgres.
 *
 * Rows travel between the two processes as newline-delimited JSON. A million rows is a
 * normal ask here, so they are generated, written and read one at a time and never all
 * held in memory at once.
 */
import { createWriteStream } from "node:fs";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import type { Resource } from "@flaredev/core";
import pc from "picocolors";
import { prismaModel, toPrismaRow } from "../seed/prisma-rows.js";
import { seedRows, type ParentIds } from "../seed/rows.js";
import { runNode, runNodeCapturing, resolveBin } from "./run.js";

/**
 * Rows per `createMany`. Prisma sends one multi-row INSERT, and Postgres caps a statement
 * at 65535 bound parameters — a few thousand rows of a wide table stays well inside that
 * while keeping the number of round trips small.
 */
const CHUNK = 2_000;

/** Parent ids to sample, matching the Cloudflare path. */
const PARENT_SAMPLE = 5000;

export interface PrismaSeedOptions {
  count: number;
  truncate?: boolean;
  seed?: number;
  /** Resources this one belongs to: the descriptor's name, and the Prisma model to read ids from. */
  parentTargets: { resource: string; model: string }[];
}

/** What the probe run reports back, through a file rather than stdout. */
interface Probe {
  parents: Record<string, string[]>;
  existing: number;
}

const RUNNER = ".flare-seed-resource-runner.mts";

/**
 * The runner that is written into the app and executed with its own `tsx`.
 *
 * One file, two modes. It is cheaper to write once and run twice than to manage two
 * temporary files, and a killed run leaves one stray file rather than two.
 *
 * Errors are caught and reduced to their first line on the way out. Prisma's are a
 * screenful — the query, the engine version, a stack through generated code — and the
 * CLI prints one red line everywhere else.
 */
function runnerScript(): string {
  return `import "dotenv/config";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { prisma } from "./lib/db";

const [mode, planPath] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, "utf8"));

// The client is addressed by model name, which is only known at run time.
const client = prisma as unknown as Record<
  string,
  {
    findMany(args: unknown): Promise<{ id: string }[]>;
    count(): Promise<number>;
    createMany(args: { data: unknown[] }): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  }
>;

function delegate(model: string) {
  const found = client[model];
  if (!found) throw new Error('No Prisma model "' + model + '". Run \`flare gen\` first, or \`prisma generate\`.');
  return found;
}

async function probe() {
  const parents: Record<string, string[]> = {};
  for (const target of plan.parents) {
    const rows = await delegate(target.model).findMany({ select: { id: true }, take: ${PARENT_SAMPLE} });
    // Keyed by resource name, which is what the row generator looks a belongsTo up by.
    parents[target.resource] = rows.map((row) => row.id);
  }
  const existing = plan.countExisting ? await delegate(plan.model).count() : 0;
  writeFileSync(plan.out, JSON.stringify({ parents, existing }));
}

async function insert() {
  const target = delegate(plan.model);

  if (plan.truncate) {
    try {
      await target.deleteMany({});
    } catch (error) {
      // Postgres refuses to orphan a row, and says so as 23503.
      const code = (error as { code?: string }).code;
      if (code === "P2003" || String((error as Error).message).includes("23503")) {
        throw new Error(
          "--truncate cannot empty " + plan.table + ": other rows point at it with a foreign key. " +
            "Empty the tables that belong to it first, or seed without --truncate.",
        );
      }
      throw error;
    }
  }

  let batch: unknown[] = [];
  let written = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    await target.createMany({ data: batch });
    written += batch.length;
    batch = [];
    if (process.stdout.isTTY) {
      process.stdout.write("\\r  " + written.toLocaleString() + " of " + plan.total.toLocaleString() + " rows");
    }
  };

  const lines = createInterface({ input: createReadStream(plan.rows), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line === "") continue;
    batch.push(JSON.parse(line));
    if (batch.length >= ${CHUNK}) await flush();
  }
  await flush();
  if (process.stdout.isTTY) process.stdout.write("\\r" + " ".repeat(48) + "\\r");
  writeFileSync(plan.out, JSON.stringify({ written }));
}

try {
  await (mode === "probe" ? probe() : insert());
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.split("\\n").find((line) => line.trim() !== "") ?? message);
  process.exitCode = 1;
} finally {
  await (prisma as unknown as { $disconnect(): Promise<void> }).$disconnect();
}
`;
}

/** Generate `count` rows and write them to `file` as NDJSON, one at a time. */
async function writeRows(
  file: string,
  resource: Resource,
  count: number,
  options: { seed?: number; parentIds: ParentIds; startIndex: number },
): Promise<void> {
  const stream = createWriteStream(file, { encoding: "utf8" });
  for (const row of seedRows(resource, count, options)) {
    // A Date serialises to the ISO string Prisma accepts for a DateTime, so the row
    // survives the trip between the processes unchanged.
    if (!stream.write(`${JSON.stringify(toPrismaRow(resource, row))}\n`)) await once(stream, "drain");
  }
  stream.end();
  await once(stream, "finish");
}

/**
 * Fill a table on the Next.js stack. Returns the number of rows written.
 */
export async function seedResourceWithPrisma(
  appRoot: string,
  resource: Resource,
  options: PrismaSeedOptions,
  log: (message: string) => void,
): Promise<number> {
  const tsx = resolveBin(appRoot, "tsx", "tsx");
  const runner = join(appRoot, RUNNER);
  const dir = mkdtempSync(join(tmpdir(), "flare-seed-"));
  const planFile = join(dir, "plan.json");
  const outFile = join(dir, "out.json");
  const rowsFile = join(dir, "rows.ndjson");
  const model = prismaModel(resource);

  writeFileSync(runner, runnerScript());
  try {
    // One read before generating anything: which ids a belongsTo may point at, and how
    // many rows are already there so this run's numbering carries on from them.
    const needsProbe = options.parentTargets.length > 0 || !options.truncate;
    let probe: Probe = { parents: {}, existing: 0 };
    if (needsProbe) {
      writeFileSync(planFile, JSON.stringify({ model, out: outFile, countExisting: !options.truncate, parents: options.parentTargets }));
      const { code, output } = await runNodeCapturing([tsx, runner, "probe", planFile], appRoot);
      if (code !== 0) throw new Error(`Could not read the database before seeding.\n${output.trim()}`);
      probe = JSON.parse(readFileSync(outFile, "utf8")) as Probe;
    }

    const parentIds: ParentIds = new Map(Object.entries(probe.parents));
    for (const target of options.parentTargets) {
      // seedRows throws the same way for a required parent, but only once it reaches the
      // field. Saying it before generating a million rows is the kinder order.
      if ((parentIds.get(target.resource) ?? []).length === 0 && resourceNeeds(resource, target.resource)) {
        throw new Error(`${resource.name} needs a ${target.resource} to belong to, and there are none. Seed ${target.resource} first.`);
      }
    }

    log(`${pc.cyan("●")} Writing ${options.count.toLocaleString()} rows to ${pc.bold(resource.table)}`);
    await writeRows(rowsFile, resource, options.count, { seed: options.seed, parentIds, startIndex: probe.existing });

    writeFileSync(planFile, JSON.stringify({ model, table: resource.table, out: outFile, rows: rowsFile, truncate: !!options.truncate, total: options.count }));
    const code = await runNode([tsx, runner, "insert", planFile], appRoot);
    // The runner has already printed why, in one line. Saying "some rows may have been
    // written" here would be a guess, and wrong whenever it failed before the first batch.
    if (code !== 0) throw new Error("Seeding stopped; the reason is above.");
    const { written } = JSON.parse(readFileSync(outFile, "utf8")) as { written: number };
    return written;
  } finally {
    rmSync(runner, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Whether a required belongsTo points at this target, so an empty parent is fatal. */
function resourceNeeds(resource: Resource, target: string): boolean {
  return Object.values(resource.fields).some(
    (field) => field.kind === "belongsTo" && (field as { target: string }).target === target && (field as { required?: boolean }).required === true,
  );
}
