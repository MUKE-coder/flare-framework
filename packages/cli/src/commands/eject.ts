import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import pc from "picocolors";
import { readStack, type Stack } from "../stack.js";
import { CLOUDFLARE_ONLY } from "../versions.js";
import { templatesDir } from "../utils/fs.js";
import { joinMarkers, splitMarkers } from "../generator/markers.js";
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

/**
 * Where Flare's own code lands in an app.
 *
 * Everything under these, except the files below. `lib/resource` alone was not enough:
 * the storage adapter, the cache, the API helpers and every dashboard component are
 * copied too, so a fix to any of them could never reach an existing app — which is the
 * whole thing these commands exist to prevent.
 *
 * `app` for the same reason, and it was missed until a change to
 * `app/dashboard/actions.ts` had nowhere to go. The per-resource routes and pages under
 * `app/api/<slug>/` and `app/dashboard/<slug>/` are not affected: they have no template to
 * compare against, so they fall out below — `flare sync-types` is what keeps those current.
 */
const TRACKED = ["app", "lib", "components"];

/**
 * Copies that are the app's own, not Flare's.
 *
 * A template containing `__APP_NAME__` or another placeholder is rewritten per app and
 * can never match byte for byte, so comparing it would report noise forever. Files
 * written rather than copied — `lib/auth-config.ts`, from the sign-in methods chosen at
 * create time — have no template to compare against and fall out on their own.
 */
const PER_APP = /__APP_NAME__|__PM__|__THEME__|__COMPAT_DATE__/;

/**
 * Copies with a template that isn't what the app gets.
 *
 * `lib/auth-config.ts` ships as a template and is then overwritten with the sign-in
 * methods chosen at create time, so it differs from its template in every app that
 * exists, for a reason that is nobody's problem.
 */
const WRITTEN_PER_APP = new Set(["lib/auth-config.ts"]);

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
  if (prunedOn(path, stack) || WRITTEN_PER_APP.has(path)) return undefined;
  const found = locate(path, stack);
  if (found && PER_APP.test(readFileSync(found, "utf8"))) return undefined;
  return found;
}

function locate(path: string, stack: Stack): string | undefined {
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
      if (mine === theirs) return { path, state: "same" as const, mine, theirs };
      // What `update` would actually write: upstream's code, this app's generated block.
      const merged = mergeGeneratedBlock(mine, theirs);
      if (merged !== undefined) {
        // Already upstream apart from the block a generator owns, so there is nothing to
        // report and nothing to do.
        if (merged === mine) return { path, state: "same" as const, mine, theirs };
        return { path, state: "changed" as const, mine, theirs: merged };
      }
      return { path, state: "changed" as const, mine, theirs };
    });
}

/**
 * Flare's version of a file, with this app's generated block kept.
 *
 * Some tracked files have a `// generated:start` block that a *generator* owns, not the
 * person: `lib/dashboard-nav.ts` holds the sidebar links `flare gen security` and
 * `flare gen apikeys` add, and `lib/security.ts` holds the guard's configuration. Taking
 * the template wholesale would quietly remove them, so an app that ran `flare update`
 * lost its Security and API keys links and had to re-run both generators to find out why.
 *
 * `update` is meant to discard *your* edits to Flare's code. Generator output is neither:
 * it is this app's state, written into a slot the template provides. So the code around
 * the markers comes from upstream and the block stays.
 *
 * Returns the merged text, or undefined when there is nothing to merge — no block on one
 * side or the other, or a file whose markers are malformed, where overwriting is the
 * honest outcome.
 */
export function mergeGeneratedBlock(mine: string, theirs: string): string | undefined {
  let ours: ReturnType<typeof splitMarkers>;
  let upstream: ReturnType<typeof splitMarkers>;
  try {
    ours = splitMarkers(mine);
    upstream = splitMarkers(theirs);
  } catch {
    // Markers that don't parse are not a block worth preserving.
    return undefined;
  }
  if (!ours || !upstream) return undefined;
  if (ours.block === upstream.block) return undefined;
  // The hash travels with the block: it is what says whether the block was hand-edited.
  return joinMarkers({ ...upstream, block: ours.block, hash: ours.hash });
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
