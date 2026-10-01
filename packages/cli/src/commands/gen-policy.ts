import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { definePolicy } from "@flaredev/core";
import pc from "picocolors";
import { resourceName } from "../generator/descriptor.js";
import { loadResources } from "../generator/load.js";
import { DriftError, writeGenerated } from "../generator/markers.js";
import { applyPlan, logResults, planFiles } from "../generator/plan.js";
import { loadPolicies, policyPath, renderPolicy, renderPolicyBlock, type PolicyRoles } from "../generator/policy.js";
import { findAppRoot } from "./run.js";
import { readStack } from "../stack.js";

export interface GenPolicyOptions {
  /** Comma-separated roles, e.g. "admin,staff". */
  roles?: string;
  /** Roles allowed to delete (default: the first role). */
  deleteRoles?: string;
  /** Field holding the owning user's id, e.g. "userId" — confines each user to their own rows. */
  own?: string;
  /** Roles exempt from `--own`, e.g. "admin". */
  ownExcept?: string;
  cwd?: string;
  force?: boolean;
  log?: (message: string) => void;
}

export function parseRoles(input: string | undefined, what = "--roles"): string[] {
  const roles = (input ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  if (roles.length === 0) throw new Error(`${what} is required, e.g. ${what} admin,staff`);
  return [...new Set(roles)];
}

/**
 * `flare gen policy <Resource> --roles admin,staff [--delete-roles admin] [--own userId]`
 *
 * Read, create and update get the given roles; delete defaults to the first role only,
 * since deletion is usually the narrowest permission. `--own <field>` adds per-record
 * ownership on top, confining each user to the rows that field points at. Edit the file
 * afterwards.
 */
export async function genPolicy(rawName: string, options: GenPolicyOptions): Promise<{ name: string; path: string }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const name = resourceName(rawName);

  const resources = await loadResources(appRoot);
  const target = resources.find(({ resource }) => resource.name === name);
  if (!target) {
    const known = resources.map(({ resource }) => resource.name).join(", ") || "none";
    throw new Error(`No resource "${name}". Generate it first. Known resources: ${known}.`);
  }

  // Checked against the descriptor, not just the shape: a policy scoping every query to a
  // column that isn't there is the kind of mistake that looks like an empty table.
  if (options.own !== undefined) {
    const field = options.own.trim();
    const def = target.resource.fields[field];
    if (!def) {
      // The likely fields, so the message is a fix rather than a complaint.
      const candidates = Object.entries(target.resource.fields)
        .filter(([key, entry]) => (entry.kind === "string" || entry.kind === "belongsTo") && /user|owner|author|member/i.test(key))
        .map(([key]) => key);
      const hint =
        candidates.length > 0
          ? ` Did you mean ${candidates.map((key) => `--own ${key}`).join(" or ")}?`
          : ` Add a field to hold it first: \`flare gen resource ${name} --fields '${field}:string'\`.`;
      throw new Error(`${name} has no field "${field}", so --own ${field} would scope every query to a column that doesn't exist.${hint}`);
    }
    // Ownership compares the column with the signed-in user's id, which is a string.
    if (def.kind !== "string" && def.kind !== "belongsTo") {
      throw new Error(
        `--own ${field} names a ${def.kind} field. Ownership compares it with the signed-in user's id, so it has to be a string field (or a belongsTo).`,
      );
    }
  }

  const relative = policyPath(name);
  const path = join(appRoot, relative);
  const exists = existsSync(path);

  let roles: PolicyRoles | undefined;
  if (options.roles || options.own !== undefined || !exists) {
    const allowed = parseRoles(options.roles);
    const own =
      options.own === undefined
        ? undefined
        : { field: options.own.trim(), except: options.ownExcept ? parseRoles(options.ownExcept, "--own-except") : [] };
    roles = {
      read: allowed,
      create: allowed,
      update: allowed,
      delete: options.deleteRoles ? parseRoles(options.deleteRoles, "--delete-roles") : [allowed[0]!],
      own,
    };
    // Validate before writing (same rules the runtime applies).
    definePolicy({ resource: name, ...roles });
  }

  if (roles) {
    const block = renderPolicyBlock(roles);
    if (!exists) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, renderPolicy(name, roles));
      log(`${pc.green("create".padEnd(9))} ${relative}`);
    } else {
      try {
        const outcome = writeGenerated(path, block, { force: options.force });
        log(`${(outcome === "identical" ? pc.dim : pc.yellow)(outcome.padEnd(9))} ${relative}`);
      } catch (error) {
        if (error instanceof DriftError) {
          throw new Error(`The roles in ${relative} were edited by hand, so --roles won't overwrite them. Edit the file directly, or pass --force.`);
        }
        throw error;
      }
    }
  }

  // Refresh the policy registry the app reads at runtime.
  const policies = await loadPolicies(appRoot);
  logResults(applyPlan(appRoot, planFiles(resources, policies, readStack(appRoot))), log);
  log(`\n${pc.dim("Roles come from `flare role:add`; the API and the admin both enforce this policy.")}`);
  return { name, path: relative };
}
