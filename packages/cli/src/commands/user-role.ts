import pc from "picocolors";
import { extractJson, readD1Databases, runWrangler } from "../utils/wrangler.js";
import { listRoles } from "./role.js";
import { findAppRoot, resolveBin } from "./run.js";

export interface UserRoleOptions {
  remote?: boolean;
  env?: string;
  cwd?: string;
  log?: (message: string) => void;
}

const ROLE = /^[a-z][a-z0-9_-]{0,31}$/;
const EMAIL = /^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/;

/** SQL that sets a user's role by email and returns the updated row. Inputs must already be validated. */
export function userRoleSql(email: string, role: string): string {
  if (!EMAIL.test(email)) throw new Error(`"${email}" doesn't look like an email address.`);
  if (!ROLE.test(role)) throw new Error(`Invalid role "${role}". Use lowercase letters, digits, _ or -, e.g. admin or staff.`);
  // Validated above to contain no quotes or backslashes, so plain quoting is safe.
  return `UPDATE "user" SET role = '${role}', updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE lower(email) = lower('${email}') RETURNING email, role`;
}

/** `flare user:role <email> <role>`: set a user's role (e.g. make the first admin). */
export async function setUserRole(email: string, role: string, options: UserRoleOptions = {}): Promise<number> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const sql = userRoleSql(email, role);

  // Catch typos: the role table lists what the app has registered (older apps have none).
  const roles = await listRoles(options);
  if (roles && !roles.includes(role)) {
    log(pc.red(`No role "${role}" is registered. Known roles: ${roles.join(", ") || "none"}.`));
    log(pc.dim(`Register it with: flare role:add ${role}${options.remote ? " --remote" : ""}`));
    return 1;
  }
  const db = readD1Databases(appRoot)[0];
  if (!db) throw new Error("No d1_databases in wrangler.jsonc.");

  const target = [options.remote ? "--remote" : "--local", ...(options.env ? ["--env", options.env] : [])];
  const result = await runWrangler(resolveBin(appRoot, "wrangler", "wrangler"), ["d1", "execute", db.binding, ...target, "--json", "--command", sql], appRoot, {
    capture: true,
  });
  if (result.code !== 0) throw new Error(`Could not update the user:\n${result.output.trim()}`);
  const [first] = extractJson<{ results: { email: string; role: string }[] }[]>(result.output);
  const updated = first?.results ?? [];
  if (updated.length === 0) {
    log(pc.red(`No user with email ${email} in the ${options.remote ? "remote" : "local"} database. Sign up first, then run this again.`));
    return 1;
  }
  log(pc.green(`${updated[0]!.email} now has role "${updated[0]!.role}" (${options.remote ? "remote" : "local"}).`));
  return 0;
}
