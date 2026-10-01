/**
 * Resource-level policies: which roles may read, create, update, or delete a resource,
 * and — with `own` — which rows each user may touch.
 *
 * Policies are plain data, like descriptors, so the API layer and the admin UI read the
 * same rules at runtime. That is why ownership is a field name and a list of exempt
 * roles rather than a callback: it can be read, printed and reasoned about without being
 * run, and it crosses to the dashboard unchanged. Field-level rules are still out of
 * scope.
 *
 * Roles and ownership answer different questions and compose. The role decides whether
 * you may list invoices at all; ownership decides which invoices "all of them" means.
 */

export type PolicyAction = "list" | "read" | "create" | "update" | "delete";

/**
 * Per-record ownership: each user sees and changes only the rows that are theirs.
 *
 * `field` is a field on the resource holding the owning user's id — normally a
 * `belongsTo("User")`. The store fills it in on create, requires it to match on read,
 * update and delete, and adds it to every list query, so a row that isn't yours is a
 * 404 rather than a 403: a user who can't see a record shouldn't learn it exists.
 */
export interface PolicyOwnership {
  /** The field holding the owning user's id, e.g. "userId". */
  field: string;
  /** Roles that see and change every row regardless — usually `["admin"]`. */
  except: string[];
}

/** Roles allowed per action; `"*"` means any signed-in user. */
export interface Policy {
  resource: string;
  read: string[];
  create: string[];
  update: string[];
  delete: string[];
  /** Restrict every action to the user's own rows. Absent means no restriction. */
  own?: PolicyOwnership;
}

export interface PolicyConfig {
  resource: string;
  read?: string[];
  create?: string[];
  update?: string[];
  delete?: string[];
  /**
   * Restrict every action to the user's own rows.
   *
   * `{ field: "userId" }` is the common case: `except` defaults to none, so even an
   * admin sees only their own unless you say otherwise.
   */
  own?: { field: string; except?: string[] };
}

const ROLE = /^(\*|[a-z][a-z0-9_-]{0,31})$/;
/** A field key, as a descriptor writes it. */
const FIELD = /^[a-z][A-Za-z0-9]*$/;

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export function definePolicy(config: PolicyConfig): Policy {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(config.resource)) {
    throw new PolicyError(`Policy resource "${config.resource}" must be a PascalCase resource name.`);
  }
  const clean = (action: Exclude<PolicyAction, "list">): string[] => {
    const roles = config[action] ?? [];
    for (const role of roles) {
      if (!ROLE.test(role)) throw new PolicyError(`Policy ${config.resource}.${action}: invalid role "${role}" (lowercase letters, digits, _ or -, or "*").`);
    }
    return [...new Set(roles)];
  };
  const policy: Policy = {
    resource: config.resource,
    read: clean("read"),
    create: clean("create"),
    update: clean("update"),
    delete: clean("delete"),
  };

  if (config.own) {
    const { field, except = [] } = config.own;
    if (!FIELD.test(field)) {
      throw new PolicyError(`Policy ${config.resource}.own: "${field}" is not a field name (camelCase, starting with a lowercase letter).`);
    }
    // "*" would mean "every signed-in user is exempt", which is the same as having no
    // ownership at all — and a policy that reads as a restriction but isn't is worse
    // than either.
    for (const role of except) {
      if (role === "*") throw new PolicyError(`Policy ${config.resource}.own.except: "*" exempts everyone, which is the same as leaving out \`own\`.`);
      if (!ROLE.test(role)) throw new PolicyError(`Policy ${config.resource}.own.except: invalid role "${role}" (lowercase letters, digits, _ or -).`);
    }
    policy.own = { field, except: [...new Set(except)] };
  }

  return policy;
}

/**
 * Whether `role` may perform `action`. Without a policy any signed-in user is allowed
 * (callers must already have required a session); generate one with
 * `flare gen policy <Resource> --roles …` to restrict a resource.
 */
export function can(policy: Policy | undefined | null, role: string | null | undefined, action: PolicyAction): boolean {
  if (!policy) return true;
  const allowed = policy[action === "list" ? "read" : action];
  if (allowed.includes("*")) return Boolean(role);
  return Boolean(role) && allowed.includes(role!);
}

/**
 * The rows this user is limited to, or null when they may touch every row.
 *
 * Null for three different reasons — no policy, no `own`, or a role in `except` — and
 * the caller treats them the same, because they mean the same thing.
 */
export function ownershipFilter(
  policy: Policy | undefined | null,
  user: { id: string; role?: string | null } | null | undefined,
): { field: string; value: string } | null {
  const own = policy?.own;
  if (!own || !user) return null;
  if (user.role != null && own.except.includes(user.role)) return null;
  return { field: own.field, value: user.id };
}

/** Actions `role` may perform, for hiding UI it can't use. */
export function allowedActions(policy: Policy | undefined | null, role: string | null | undefined): Record<Exclude<PolicyAction, "list">, boolean> {
  return {
    read: can(policy, role, "read"),
    create: can(policy, role, "create"),
    update: can(policy, role, "update"),
    delete: can(policy, role, "delete"),
  };
}
