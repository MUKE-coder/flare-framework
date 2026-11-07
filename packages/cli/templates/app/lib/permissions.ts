import { revalidateTag } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { withGrants, type PermissionGrant, type Policy, type PolicyAction } from "@flaredev/core";
import { getDb } from "@/db";
import { role as roleTable, rolePermission } from "@/db/flare-schema";
import { user } from "@/db/auth-schema";
import { policies } from "@/policies";
import { cached, TTL } from "./cache";

/**
 * Permissions managed from the dashboard, on top of the policies in your code.
 *
 * `policies/*.policy.ts` is the floor and this only ever widens it — the reasoning is
 * in `withGrants` (@flaredev/core), and the short version is that a row in a table must
 * never be able to lock an app out or quietly restrict something the code left open.
 *
 * Everything here is cached under one tag and revalidated on every write, so a role
 * change takes effect on the editor's next request rather than in a minute's time.
 */

export const GRANTS_TAG = "flare/permissions";

/** The four things a role can be granted. "list" is read, so it is not one of them. */
export const GRANTABLE: Exclude<PolicyAction, "list">[] = ["read", "create", "update", "delete"];

const readGrants = cached(
  async (): Promise<PermissionGrant[]> => {
    const rows = await getDb()
      .select({ role: rolePermission.role, resource: rolePermission.resource, action: rolePermission.action })
      .from(rolePermission);
    return rows as PermissionGrant[];
  },
  ["flare", "permissions"],
  { tags: [GRANTS_TAG], revalidate: TTL.medium },
);

/** Every grant in the database. */
export function allGrants(): Promise<PermissionGrant[]> {
  return readGrants();
}

/** The policy in your code, before the dashboard's grants. */
export function codePolicy(resourceName: string): Policy | undefined {
  return (policies as Record<string, Policy | undefined>)[resourceName];
}

/**
 * The policy actually enforced for a resource: the file, widened by the grants.
 *
 * Undefined when there is no policy file, which means the resource is open to every
 * signed-in user — and grants on it do nothing. The roles screen says so.
 */
export async function effectivePolicy(resourceName: string): Promise<Policy | undefined> {
  return withGrants(codePolicy(resourceName), resourceName, await allGrants());
}

/** Roles that exist, newest last. Registering one is what makes it offerable in the UI. */
export async function listRoles(): Promise<{ name: string; label: string }[]> {
  return getDb().select({ name: roleTable.name, label: roleTable.label }).from(roleTable).orderBy(asc(roleTable.createdAt));
}

/**
 * Roles that accounts actually hold, registered or not.
 *
 * `flare user:role someone@example.com auditor` is a complete way to create a role —
 * the string on the account is the role. If this screen only listed the `role` table it
 * would hide the ones already in use, and you could not grant anything to them. So the
 * two lists are merged, and holding a role is enough to appear.
 */
export async function rolesInUse(): Promise<string[]> {
  const rows = await getDb().selectDistinct({ role: user.role }).from(user);
  return rows.map((row) => row.role).filter((role): role is string => Boolean(role));
}

export async function createRole(name: string, label: string): Promise<void> {
  await getDb().insert(roleTable).values({ name, label }).onConflictDoUpdate({ target: roleTable.name, set: { label } });
  revalidateTag(GRANTS_TAG, { expire: 0 });
}

/**
 * Forget a role.
 *
 * Its grants go with it — a grant naming a role nobody holds is noise that will outlive
 * everyone who remembers what it was for. Accounts keep the role string they have;
 * `can()` simply stops finding grants for it, and the policy file still decides.
 */
export async function deleteRole(name: string): Promise<void> {
  const db = getDb();
  await db.delete(rolePermission).where(eq(rolePermission.role, name));
  await db.delete(roleTable).where(eq(roleTable.name, name));
  revalidateTag(GRANTS_TAG, { expire: 0 });
}

/** Tick or untick one cell of the matrix. */
export async function setGrant(role: string, resource: string, action: string, granted: boolean): Promise<void> {
  const db = getDb();
  if (granted) {
    await db.insert(rolePermission).values({ role, resource, action }).onConflictDoNothing();
  } else {
    await db
      .delete(rolePermission)
      .where(and(eq(rolePermission.role, role), eq(rolePermission.resource, resource), eq(rolePermission.action, action)));
  }
  revalidateTag(GRANTS_TAG, { expire: 0 });
}
