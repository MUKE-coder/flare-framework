import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { camelCase, kebabCase, type Policy } from "@flaredev/core";
import { createJiti } from "jiti";
import { hashBlock, joinMarkers } from "./markers.js";

export interface LoadedPolicy {
  policy: Policy;
  /** e.g. "policies/contact.policy.ts" */
  file: string;
  /** e.g. "contact" */
  stem: string;
}

export const policyPath = (name: string) => `policies/${kebabCase(name)}.policy.ts`;
export const policyLocal = (stem: string) => `${camelCase(stem)}Policy`;

/** Load every `policies/*.policy.ts`, sorted by file name. */
export async function loadPolicies(root: string): Promise<LoadedPolicy[]> {
  const appRoot = resolve(root);
  const dir = join(appRoot, "policies");
  if (!existsSync(dir)) return [];
  const jiti = createJiti(join(appRoot, "package.json"), { moduleCache: false, fsCache: false });

  const loaded: LoadedPolicy[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".policy.ts")).sort()) {
    const mod = (await jiti.import(join(dir, file))) as { default?: Policy };
    const policy = mod.default;
    if (!policy || typeof policy !== "object" || !("resource" in policy) || !Array.isArray(policy.read)) {
      throw new Error(`policies/${file} must \`export default definePolicy({ ... })\`.`);
    }
    loaded.push({ policy, file: `policies/${file}`, stem: file.replace(/\.policy\.ts$/, "") });
  }
  return loaded;
}

/** The roles block of a policy file (unindented), as written between its markers. */
export function renderPolicyBlock(roles: { read: string[]; create: string[]; update: string[]; delete: string[] }): string {
  const list = (values: string[]) => `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
  return (["read", "create", "update", "delete"] as const).map((action) => `${action}: ${list(roles[action])},`).join("\n") + "\n";
}

/** A new policy file for `resource`. */
export function renderPolicy(resource: string, roles: { read: string[]; create: string[]; update: string[]; delete: string[] }): string {
  const block = renderPolicyBlock(roles);
  return joinMarkers({
    before: `import { definePolicy } from "@flaredev/core";

/**
 * Who may do what with ${resource} records. Roles come from \`flare role:add\`;
 * "*" means any signed-in user. The API layer and the admin UI both read this.
 */
export default definePolicy({
  resource: ${JSON.stringify(resource)},
`,
    block,
    after: `});
`,
    indent: "  ",
    hash: hashBlock(block),
  });
}

/** Generated block of `policies/index.ts`: every policy, keyed by resource name. */
export function renderPolicyRegistry(all: LoadedPolicy[]): string {
  if (all.length === 0) return "export const policies = {} as const;\n";
  const sorted = [...all].sort((a, b) => a.policy.resource.localeCompare(b.policy.resource));
  return [
    ...sorted.map(({ stem }) => `import ${policyLocal(stem)} from "./${stem}.policy";`),
    "",
    "export const policies = {",
    ...sorted.map(({ policy, stem }) => `  ${policy.resource}: ${policyLocal(stem)},`),
    "} as const;",
    "",
  ].join("\n");
}
