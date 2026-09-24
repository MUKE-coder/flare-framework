import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { definePolicy } from "@flaredev/core";
import pc from "picocolors";
import { resourceName } from "../generator/descriptor.js";
import { loadResources } from "../generator/load.js";
import { DriftError, writeGenerated } from "../generator/markers.js";
import { applyPlan, logResults, planFiles } from "../generator/plan.js";
import { loadPolicies, policyPath, renderPolicy, renderPolicyBlock } from "../generator/policy.js";
import { findAppRoot } from "./run.js";
import { readStack } from "../stack.js";

export interface GenPolicyOptions {
  /** Comma-separated roles, e.g. "admin,staff". */
  roles?: string;
  /** Roles allowed to delete (default: the first role). */
  deleteRoles?: string;
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
 * `flare gen policy <Resource> --roles admin,staff [--delete-roles admin]`
 *
 * Read, create and update get the given roles; delete defaults to the first role only,
 * since deletion is usually the narrowest permission. Edit the file afterwards.
 */
export async function genPolicy(rawName: string, options: GenPolicyOptions): Promise<{ name: string; path: string }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const name = resourceName(rawName);

  const resources = await loadResources(appRoot);
  if (!resources.some(({ resource }) => resource.name === name)) {
    const known = resources.map(({ resource }) => resource.name).join(", ") || "none";
    throw new Error(`No resource "${name}". Generate it first. Known resources: ${known}.`);
  }

  const relative = policyPath(name);
  const path = join(appRoot, relative);
  const exists = existsSync(path);

  let roles: string[] | undefined;
  let deleteRoles: string[] | undefined;
  if (options.roles || !exists) {
    roles = parseRoles(options.roles);
    deleteRoles = options.deleteRoles ? parseRoles(options.deleteRoles, "--delete-roles") : [roles[0]!];
    // Validate before writing (same rules the runtime applies).
    definePolicy({ resource: name, read: roles, create: roles, update: roles, delete: deleteRoles });
  }

  if (roles && deleteRoles) {
    const block = renderPolicyBlock({ read: roles, create: roles, update: roles, delete: deleteRoles });
    if (!exists) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, renderPolicy(name, { read: roles, create: roles, update: roles, delete: deleteRoles }));
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
