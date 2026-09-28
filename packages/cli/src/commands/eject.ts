import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import pc from "picocolors";
import { readStack, type Stack } from "../stack.js";
import { CLOUDFLARE_ONLY } from "../versions.js";
import { templatesDir } from "../utils/fs.js";
import { findAppRoot } from "./run.js";

/**
 * `flare diff` and `flare update`, for the code Flare copies into an app.
 *
 * The engine under `lib/resource/` is the app's own code — that is the point of
 * copying it rather than importing it. The cost of that bargain is that a fix in a
 * later Flare release does not reach an app on its own, so these two commands exist:
 * one says what changed, the other applies it, and neither runs unasked.
 *
 * shadcn/ui makes the same trade and answers it the same way.
 */

/** Files Flare owns upstream and copies into an app. */
const TRACKED = ["lib/resource"];

export interface EjectOptions {
  cwd?: string;
  log?: (message: string) => void;
  /** Limit to paths containing this string. */
  filter?: string;
}

interface Comparison {
  path: string;
  /** Whichever of "same" | "changed" | "missing" | "added" this file is. */
  state: "same" | "changed" | "missing" | "added";
  mine?: string;
  theirs?: string;
}

/** Files a Next.js app deliberately doesn't have, so they aren't "missing" there. */
const prunedOn = (path: string, stack: Stack) =>
  stack === "next" && CLOUDFLARE_ONLY.some((only) => path === only || path.startsWith(`${only}/`));

/** Where a tracked file lives upstream, per stack: the Next overlay wins when it has one. */
function upstreamFile(path: string, stack: Stack): string | undefined {
  if (prunedOn(path, stack)) return undefined;
  const candidates = stack === "next" ? [join(templatesDir, "next", path), join(templatesDir, "app", path)] : [join(templatesDir, "app", path)];
  return candidates.find((candidate) => existsSync(candidate));
}

/** Every tracked file, from both the app and upstream. */
function trackedPaths(appRoot: string, stack: Stack): string[] {
  const paths = new Set<string>();
  const walk = (base: string, dir: string) => {
    if (!existsSync(join(base, dir))) return;
    for (const entry of readdirSync(join(base, dir), { withFileTypes: true })) {
      const next = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(base, next);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) paths.add(next);
    }
  };
  for (const root of TRACKED) {
    walk(appRoot, root);
    walk(join(templatesDir, "app"), root);
    if (stack === "next") walk(join(templatesDir, "next"), root);
  }
  // A file the other stack owns is not this app's business.
  return [...paths].filter((path) => upstreamFile(path, stack) !== undefined).sort();
}

export function compareTracked(appRoot: string, stack: Stack, filter?: string): Comparison[] {
  return trackedPaths(appRoot, stack)
    .filter((path) => !filter || path.includes(filter))
    .map((path) => {
      const source = upstreamFile(path, stack)!;
      const theirs = readFileSync(source, "utf8");
      const target = join(appRoot, path);
      if (!existsSync(target)) return { path, state: "missing" as const, theirs };
      const mine = readFileSync(target, "utf8");
      return { path, state: mine === theirs ? ("same" as const) : ("changed" as const), mine, theirs };
    });
}

/** A unified-ish diff: just the lines that differ, with a little context. */
function summarise(mine: string, theirs: string): string[] {
  const a = mine.split("\n");
  const b = theirs.split("\n");
  const lines: string[] = [];
  const max = Math.max(a.length, b.length);
  let shown = 0;
  for (let index = 0; index < max && shown < 12; index += 1) {
    if (a[index] === b[index]) continue;
    if (a[index] !== undefined) lines.push(pc.red(`  - ${a[index]!.slice(0, 100)}`));
    if (b[index] !== undefined) lines.push(pc.green(`  + ${b[index]!.slice(0, 100)}`));
    shown += 1;
  }
  return lines;
}

/** `flare diff [filter]`: what differs between this app's copies and the current Flare. */
export function diffTracked(options: EjectOptions = {}): Comparison[] {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const stack = readStack(appRoot);
  const comparisons = compareTracked(appRoot, stack, options.filter);

  const changed = comparisons.filter((entry) => entry.state !== "same");
  if (changed.length === 0) {
    log(pc.green(`Up to date: ${comparisons.length} file(s) match this version of Flare.`));
    return comparisons;
  }

  log(pc.bold(`${changed.length} of ${comparisons.length} file(s) differ from this version of Flare:\n`));
  for (const entry of changed) {
    if (entry.state === "missing") {
      log(`${pc.yellow("missing")}  ${entry.path} ${pc.dim("(Flare ships this; your app doesn't have it)")}`);
      continue;
    }
    log(`${pc.cyan("changed")}  ${entry.path}`);
    for (const line of summarise(entry.mine!, entry.theirs!)) log(line);
    log("");
  }
  log(pc.dim(`Yours is "-", Flare's is "+". Apply with ${pc.bold("flare update")}, or keep yours and do nothing.`));
  return comparisons;
}

/** `flare update [filter]`: overwrite this app's copies with the current Flare ones. */
export function updateTracked(options: EjectOptions & { yes?: boolean } = {}): number {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const stack = readStack(appRoot);
  const comparisons = compareTracked(appRoot, stack, options.filter);
  const changed = comparisons.filter((entry) => entry.state !== "same");

  if (changed.length === 0) {
    log(pc.green("Nothing to update."));
    return 0;
  }

  if (!options.yes) {
    log(pc.bold(`${changed.length} file(s) would be overwritten with Flare's version:\n`));
    for (const entry of changed) log(`  ${entry.path}`);
    log(pc.yellow(`\nThis discards your edits to those files. Re-run with ${pc.bold("--yes")} to proceed.`));
    log(pc.dim(`See what would change first with ${pc.bold("flare diff")}.`));
    return 1;
  }

  for (const entry of changed) {
    const target = join(appRoot, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.theirs!);
    log(`${pc.green("update")}   ${relative(process.cwd(), target) || entry.path}`);
  }
  log(pc.green(`\nUpdated ${changed.length} file(s).`));
  return 0;
}
