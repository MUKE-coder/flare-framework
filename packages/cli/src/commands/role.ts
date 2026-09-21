import { humanize } from "@flaredev/core";
import pc from "picocolors";
import { extractJson, readD1Databases, runWrangler } from "../utils/wrangler.js";
import { findAppRoot, resolveBin } from "./run.js";

export interface RoleOptions {
  remote?: boolean;
  env?: string;
  label?: string;
  cwd?: string;
  log?: (message: string) => void;
}

export const ROLE_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

/** Upsert SQL for a role. `name` and `label` must already be validated. */
export function roleInsertSql(name: string, label: string): string {
  if (!ROLE_NAME.test(name)) throw new Error(`Invalid role "${name}". Use lowercase letters, digits, _ or -, e.g. admin or support-agent.`);
  if (/['"\\]/.test(label) || label.length > 60) throw new Error(`Invalid label "${label}". Keep it short and avoid quotes.`);
  return `INSERT INTO "role" (name, label) VALUES ('${name}', '${label}') ON CONFLICT(name) DO UPDATE SET label = excluded.label RETURNING name, label`;
}

function context(options: RoleOptions) {
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const db = readD1Databases(appRoot)[0];
  if (!db) throw new Error("No d1_databases in wrangler.jsonc.");
  return {
    appRoot,
    binding: db.binding,
    wrangler: resolveBin(appRoot, "wrangler", "wrangler"),
    target: [options.remote ? "--remote" : "--local", ...(options.env ? ["--env", options.env] : [])],
    log: options.log ?? ((message: string) => console.log(message)),
  };
}

/** Role names registered in the app, or null when the app has no role table yet. */
export async function listRoles(options: RoleOptions = {}): Promise<string[] | null> {
  const { appRoot, binding, wrangler, target } = context(options);
  const result = await runWrangler(wrangler, ["d1", "execute", binding, ...target, "--json", "--command", "SELECT name FROM role ORDER BY name"], appRoot, {
    capture: true,
  });
  if (result.code !== 0) {
    if (/no such table: role/i.test(result.output)) return null;
    throw new Error(`Could not read roles:\n${result.output.trim()}`);
  }
  const [first] = extractJson<{ results: { name: string }[] }[]>(result.output);
  return (first?.results ?? []).map((row) => row.name);
}

/** `flare role:add <name> [--label]`: register a role users can be assigned. */
export async function addRole(name: string, options: RoleOptions = {}): Promise<number> {
  const { appRoot, binding, wrangler, target, log } = context(options);
  const sql = roleInsertSql(name, options.label ?? humanize(name));
  const result = await runWrangler(wrangler, ["d1", "execute", binding, ...target, "--json", "--command", sql], appRoot, { capture: true });
  if (result.code !== 0) {
    if (/no such table: role/i.test(result.output)) {
      throw new Error("No role table yet. Run `flare migrate` first (it's part of the initial migration).");
    }
    throw new Error(`Could not add the role:\n${result.output.trim()}`);
  }
  const [first] = extractJson<{ results: { name: string; label: string }[] }[]>(result.output);
  const added = first?.results?.[0];
  log(pc.green(`Role "${added?.name ?? name}" registered (${options.remote ? "remote" : "local"}).`));
  log(pc.dim(`Assign it with: flare user:role <email> ${added?.name ?? name}${options.remote ? " --remote" : ""}`));
  return 0;
}
