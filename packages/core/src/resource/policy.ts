/**
 * Resource-level policies: which roles may read, create, update, or delete a resource.
 *
 * Policies are plain data, like descriptors, so the API layer and the admin UI read the
 * same rules at runtime. Field-level rules and per-record ownership are deliberately out
 * of scope for v1.
 */

export type PolicyAction = "list" | "read" | "create" | "update" | "delete";

/** Roles allowed per action; `"*"` means any signed-in user. */
export interface Policy {
  resource: string;
  read: string[];
  create: string[];
  update: string[];
  delete: string[];
}

export interface PolicyConfig {
  resource: string;
  read?: string[];
  create?: string[];
  update?: string[];
  delete?: string[];
}

const ROLE = /^(\*|[a-z][a-z0-9_-]{0,31})$/;

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
  const clean = (action: keyof Omit<PolicyConfig, "resource">): string[] => {
    const roles = config[action] ?? [];
    for (const role of roles) {
      if (!ROLE.test(role)) throw new PolicyError(`Policy ${config.resource}.${action}: invalid role "${role}" (lowercase letters, digits, _ or -, or "*").`);
    }
    return [...new Set(roles)];
  };
  return { resource: config.resource, read: clean("read"), create: clean("create"), update: clean("update"), delete: clean("delete") };
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

/** Actions `role` may perform, for hiding UI it can't use. */
export function allowedActions(policy: Policy | undefined | null, role: string | null | undefined): Record<Exclude<PolicyAction, "list">, boolean> {
  return {
    read: can(policy, role, "read"),
    create: can(policy, role, "create"),
    update: can(policy, role, "update"),
    delete: can(policy, role, "delete"),
  };
}
