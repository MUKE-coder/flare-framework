import type { Policy, PolicyAction } from "./policy.js";

/**
 * Permissions granted from the dashboard, on top of the policies in your code.
 *
 * Flare's policies are files — `policies/invoice.policy.ts` — and that is deliberate:
 * who may do what is reviewable in a pull request, travels with the repository, and is
 * the same on every machine before anything is deployed. Managing roles from a running
 * app means permissions in a database, and a database is none of those things.
 *
 * So the two compose rather than compete. **The policy file is the floor and the
 * database only ever widens it.** A grant adds a role to an action; nothing in the
 * dashboard can take away access the code gives, and nothing in the dashboard can make
 * a resource restricted that the code left open. That last point matters more than it
 * sounds — see {@link withGrants}.
 */

/** One row of "this role may do this to this resource". */
export interface PermissionGrant {
  role: string;
  /** The resource's descriptor name, e.g. "Invoice". */
  resource: string;
  /** "list" is read, so it is not a grant of its own. */
  action: Exclude<PolicyAction, "list">;
}

/** Whether a resource is restricted at all — i.e. whether granting on it does anything. */
export function isRestricted(policy: Policy | undefined | null): boolean {
  return Boolean(policy);
}

/**
 * A resource's policy with dashboard grants folded in.
 *
 * Returns `undefined` unchanged when there is no policy file, and that is the whole
 * subtlety of this feature: a resource with no policy is open to every signed-in user,
 * so a grant on it would be a tick-box that changes nothing. Pretending otherwise — by
 * inventing a policy from the grants — would be worse than useless: an app would start
 * refusing people the moment somebody opened the roles screen, and the reason would be
 * in a table nobody reads. The UI's job is to say "this resource is open; restrict it
 * with `flare gen policy`", and this function's job is to not lie.
 */
export function withGrants(policy: Policy | undefined | null, resource: string, grants: Iterable<PermissionGrant>): Policy | undefined {
  if (!policy) return undefined;

  const added: Record<Exclude<PolicyAction, "list">, Set<string>> = {
    read: new Set(policy.read),
    create: new Set(policy.create),
    update: new Set(policy.update),
    delete: new Set(policy.delete),
  };

  let changed = false;
  for (const grant of grants) {
    if (grant.resource !== resource) continue;
    const bucket = added[grant.action];
    // An unknown action is ignored rather than thrown on: grants come from a table, and
    // a row written by an older or newer version of the app must not take the app down.
    if (!bucket || bucket.has(grant.role)) continue;
    bucket.add(grant.role);
    changed = true;
  }
  if (!changed) return policy;

  return {
    ...policy,
    read: [...added.read],
    create: [...added.create],
    update: [...added.update],
    delete: [...added.delete],
  };
}

/**
 * Every (resource, action) a role is granted, as a lookup the UI can tick boxes from.
 *
 * Keyed `"Resource.action"` because that is what a matrix cell is.
 */
export function grantIndex(grants: Iterable<PermissionGrant>): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const grant of grants) {
    const key = `${grant.resource}.${grant.action}`;
    const roles = index.get(key) ?? new Set<string>();
    roles.add(grant.role);
    index.set(key, roles);
  }
  return index;
}
