import pc from "picocolors";
import { loadResources } from "../generator/load.js";
import { applyPlan, ensureSupportFiles, findOrphans, logResults, planFiles } from "../generator/plan.js";
import { findAppRoot } from "./run.js";

export interface SyncOptions {
  cwd?: string;
  /** Overwrite hand-edited generated blocks. */
  force?: boolean;
  /** Change nothing; exit 1 if anything is out of sync (for CI). */
  check?: boolean;
  log?: (message: string) => void;
}

/**
 * `flare sync-types`: regenerate every derived file (schema tables, relations, routes,
 * clients, validators, registry) from the resource descriptors. Hand-edited generated
 * blocks are reported as drift and left alone unless --force.
 */
export async function syncTypes(options: SyncOptions = {}): Promise<number> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const all = await loadResources(appRoot);
  const plan = planFiles(all);

  if (!options.check) ensureSupportFiles(appRoot, log);
  const results = applyPlan(appRoot, plan, { force: options.force, dryRun: options.check });
  logResults(results, log);

  const drift = results.filter((r) => r.outcome === "skipped-drift");
  const unmarked = results.filter((r) => r.outcome === "skipped-unmarked");
  const changed = results.filter((r) => r.outcome === "create" || r.outcome === "update");
  const orphans = findOrphans(appRoot, all);

  if (drift.length) {
    log(
      `\n${pc.red("Drift:")} ${drift.length} generated block(s) were edited by hand and were ${options.check ? "not checked further" : "left unchanged"}.` +
        `\nMove custom code outside the // generated:start … // generated:end block, or re-run with --force to overwrite.`,
    );
  }
  if (unmarked.length) {
    log(`\n${pc.red("Conflict:")} ${unmarked.map((r) => r.path).join(", ")} exist without a generated block (hand-written). Rename or remove them.`);
  }
  if (orphans.length) {
    const resources = [...new Set(orphans.map((o) => o.resource))];
    log(`\n${pc.yellow("Orphaned:")} generated files the descriptors no longer produce (${resources.join(", ")}):`);
    for (const orphan of orphans) log(`  ${orphan.path}`);
    log(
      `If the resource was deleted, remove them with ${pc.bold(`flare rm resource ${resources[0]}`)}; ` +
        `if it was renamed (table or slug), delete the old files.`,
    );
  }
  const tablesChanged = changed.some((r) => r.path.startsWith("db/schema/") && (r.status === "outdated" || r.status === "missing"));
  if (tablesChanged && !options.check) {
    log(`\n${pc.cyan("Tables changed.")} Create a migration with ${pc.bold("flare gen migration <name> --from-schema")}, then ${pc.bold("flare migrate")}.`);
  }

  const problems = drift.length + unmarked.length + orphans.length;
  if (options.check) {
    const stale = changed.length;
    if (stale === 0 && problems === 0) log(pc.green("Generated files are in sync with the resource descriptors."));
    else log(`\n${pc.red("Out of sync:")} ${stale} file(s) would change. Run ${pc.bold("flare sync-types")}.`);
    return stale + problems > 0 ? 1 : 0;
  }
  if (changed.length === 0 && problems === 0) log(pc.green("Everything is in sync."));
  return problems > 0 ? 1 : 0;
}
