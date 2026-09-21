import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import pc from "picocolors";
import { descriptorPath } from "../generator/descriptor.js";
import { loadResources } from "../generator/load.js";
import { splitMarkers, writeGenerated } from "../generator/markers.js";
import { generateSchemaMigration } from "../generator/migrations.js";
import { applyPlan, ensureSupportFiles, logResults, planFiles, type FileResult } from "../generator/plan.js";
import { loadPolicies, policyPath, renderPolicy } from "../generator/policy.js";
import {
  SECURITY_EVENT_POLICY,
  addSecurityBindings,
  renderAdminNavBlock,
  renderBanControls,
  renderLibSecurity,
  renderSecurityActions,
  renderSecurityConfig,
  renderSecurityDescriptor,
  renderSecurityPage,
  securityHeader,
} from "../generator/security.js";
import { findAppRoot } from "./run.js";

export interface GenSecurityOptions {
  cwd?: string;
  force?: boolean;
  /** Skip running drizzle-kit (tests without an installed app). */
  skipMigration?: boolean;
  log?: (message: string) => void;
}

/** Files `flare gen security` owns. Each is marker-tracked, like every generator output. */
export function securityFiles(appName: string): { path: string; content: string }[] {
  return [
    { path: "lib/security.ts", content: renderLibSecurity(appName) },
    { path: "app/admin/security/page.tsx", content: renderSecurityPage() },
    { path: "app/admin/security/actions.ts", content: renderSecurityActions() },
    { path: "app/admin/security/ban-controls.tsx", content: renderBanControls() },
  ];
}

/** The comment the app template ships on the pass-through lib/security.ts. */
const PASS_THROUGH_HEADER = /^\/\/ Request protection for worker\/index\.ts\.[\s\S]*?\n(?=\/\/ generated:start)/;

function writeOnce(appRoot: string, relative: string, content: string, log: (message: string) => void) {
  const path = join(appRoot, relative);
  if (existsSync(path)) {
    log(`${pc.dim("kept".padEnd(9))} ${relative} (already exists)`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  log(`${pc.green("create".padEnd(9))} ${relative}`);
}

/**
 * `flare gen security`
 *
 * Scaffolds security.config.ts (detectors, rate limits, zone rules), the SecurityEvent
 * resource (staff read, admin write), the Worker-layer guard in lib/security.ts, the
 * /admin/security dashboard with manual ban and unban, and the KV, Durable Object and
 * rate-limit bindings in wrangler.jsonc.
 */
export async function genSecurity(options: GenSecurityOptions = {}): Promise<{ files: FileResult[]; migrations: string[]; bindings: string[] }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const appName = (JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8")) as { name?: string }).name ?? "app";

  writeOnce(appRoot, "security.config.ts", renderSecurityConfig(), log);
  writeOnce(appRoot, descriptorPath("SecurityEvent"), renderSecurityDescriptor(), log);
  writeOnce(appRoot, policyPath("SecurityEvent"), renderPolicy("SecurityEvent", SECURITY_EVENT_POLICY), log);

  const files: FileResult[] = [];
  const write = (path: string, content: string, header?: string) => {
    const absolute = join(appRoot, path);
    // Swap the template's "security is off" comment for the generator's header.
    if (path === "lib/security.ts" && existsSync(absolute)) {
      const source = readFileSync(absolute, "utf8");
      if (PASS_THROUGH_HEADER.test(source)) writeFileSync(absolute, source.replace(PASS_THROUGH_HEADER, securityHeader()));
    }
    const outcome = writeGenerated(absolute, content, { header, force: options.force });
    files.push({ path, status: "missing", outcome });
    const label = outcome === "create" ? pc.green("create") : outcome === "update" ? pc.yellow("update") : pc.dim("identical");
    log(`${label.padEnd(18)} ${path}`);
  };
  for (const { path, content } of securityFiles(appName)) write(path, content, securityHeader());

  // The sidebar link. Apps created before lib/admin-nav.ts existed don't have the seam.
  const navPath = join(appRoot, "lib/admin-nav.ts");
  if (existsSync(navPath) && splitMarkers(readFileSync(navPath, "utf8"))) write("lib/admin-nav.ts", renderAdminNavBlock());
  else log(pc.yellow(`lib/admin-nav.ts not found: link to /admin/security from your admin sidebar yourself.`));

  const wranglerPath = join(appRoot, "wrangler.jsonc");
  let bindings: string[] = [];
  if (existsSync(wranglerPath)) {
    const { text, added } = addSecurityBindings(readFileSync(wranglerPath, "utf8"));
    bindings = added;
    if (added.length) {
      writeFileSync(wranglerPath, text);
      for (const line of added) log(`${pc.yellow("update".padEnd(9))} wrangler.jsonc (${line})`);
    }
  } else {
    log(pc.yellow("wrangler.jsonc not found: add the FLARE_SECURITY, FLARE_SECURITY_MONITOR and FLARE_RATE_LIMIT bindings yourself."));
  }

  const all = await loadResources(appRoot);
  ensureSupportFiles(appRoot, log);
  logResults(applyPlan(appRoot, planFiles(all, await loadPolicies(appRoot)), { force: options.force }), log);

  let migrations: string[] = [];
  if (!options.skipMigration) {
    const result = await generateSchemaMigration(appRoot, "security");
    migrations = result.files;
    for (const file of migrations) log(`${pc.green("create".padEnd(9))} ${file}`);
    for (const repair of result.repairs) log(pc.dim(`repaired  ${repair}`));
  }

  log(
    [
      "",
      `Next:`,
      `  1. ${pc.bold("flare migrate")} to create the security_events table.`,
      `  2. ${pc.bold("flare dev")}, then open ${pc.bold("/admin/security")}. Tune detectors in security.config.ts.`,
      `  3. Optional zone layer: deploy with FLARE_SECURITY_ZONE_ID and FLARE_SECURITY_API_TOKEN set (a token scoped to that`,
      `     one zone with Zone WAF Edit, Firewall Services Edit, Analytics Read, Zone Read). ${pc.bold("flare deploy")} pushes the`,
      `     zone rules and uploads both as secrets.`,
    ].join("\n"),
  );
  return { files, migrations, bindings };
}
