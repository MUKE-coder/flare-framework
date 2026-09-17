import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { genResource } from "../src/commands/gen.js";
import { genPolicy, parseRoles } from "../src/commands/gen-policy.js";
import { rmResource } from "../src/commands/rm.js";
import { roleInsertSql } from "../src/commands/role.js";

const scratch = mkdtempSync(join(import.meta.dirname, ".tmp-policy-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const quiet = { log: () => {}, skipMigration: true };
const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");

async function app() {
  const root = join(scratch, `app-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { vinext: "1" } }));
  await genResource("Deal", { ...quiet, cwd: root, fields: "title:string!" });
  return root;
}

describe("parseRoles", () => {
  it("trims, drops blanks and de-duplicates", () => {
    expect(parseRoles(" admin , staff ,, admin ")).toEqual(["admin", "staff"]);
  });

  it.each([undefined, "", " , "])("rejects %s", (input) => {
    expect(() => parseRoles(input)).toThrow(/--roles is required/);
  });
});

describe("flare gen policy", () => {
  it("writes a policy and registers it", async () => {
    const root = await app();
    const { path } = await genPolicy("deal", { ...quiet, cwd: root, roles: "admin,staff" });

    expect(path).toBe("policies/deal.policy.ts");
    const policy = read(root, path);
    expect(policy).toContain(`resource: "Deal"`);
    expect(policy).toContain(`read: ["admin", "staff"]`);
    // Delete is the narrowest permission by default: the first role only.
    expect(policy).toContain(`delete: ["admin"]`);

    const registry = read(root, "policies/index.ts");
    expect(registry).toContain(`import dealPolicy from "./deal.policy";`);
    expect(registry).toContain("Deal: dealPolicy,");
  });

  it("honours --delete-roles", async () => {
    const root = await app();
    await genPolicy("Deal", { ...quiet, cwd: root, roles: "admin,staff", deleteRoles: "admin,staff" });
    expect(read(root, "policies/deal.policy.ts")).toContain(`delete: ["admin", "staff"]`);
  });

  it("rewrites the roles of an existing policy but keeps code around them", async () => {
    const root = await app();
    await genPolicy("Deal", { ...quiet, cwd: root, roles: "admin" });
    const path = join(root, "policies/deal.policy.ts");
    writeFileSync(path, `${readFileSync(path, "utf8")}\nexport const note = "mine";\n`);

    await genPolicy("Deal", { ...quiet, cwd: root, roles: "admin,staff" });
    const policy = read(root, "policies/deal.policy.ts");
    expect(policy).toContain(`read: ["admin", "staff"]`);
    expect(policy).toContain(`export const note = "mine";`);
  });

  it("refuses to overwrite hand-edited roles without --force", async () => {
    const root = await app();
    await genPolicy("Deal", { ...quiet, cwd: root, roles: "admin" });
    const path = join(root, "policies/deal.policy.ts");
    writeFileSync(path, readFileSync(path, "utf8").replace(`read: ["admin"]`, `read: ["admin", "auditor"]`));

    await expect(genPolicy("Deal", { ...quiet, cwd: root, roles: "admin,staff" })).rejects.toThrow(/edited by hand|--force/);
    await genPolicy("Deal", { ...quiet, cwd: root, roles: "admin,staff", force: true });
    expect(read(root, "policies/deal.policy.ts")).toContain(`read: ["admin", "staff"]`);
  });

  it("rejects unknown resources and invalid roles", async () => {
    const root = await app();
    await expect(genPolicy("Ghost", { ...quiet, cwd: root, roles: "admin" })).rejects.toThrow(/No resource "Ghost"/);
    await expect(genPolicy("Deal", { ...quiet, cwd: root, roles: "Admin" })).rejects.toThrow(/role/i);
  });

  it("removes the policy with the resource", async () => {
    const root = await app();
    await genPolicy("Deal", { ...quiet, cwd: root, roles: "admin" });
    const { removed } = await rmResource("Deal", { ...quiet, cwd: root });

    expect(removed).toContain("policies/deal.policy.ts");
    expect(existsSync(join(root, "policies/deal.policy.ts"))).toBe(false);
    expect(read(root, "policies/index.ts")).toContain("export const policies = {} as const;");
  });
});

describe("roleInsertSql", () => {
  it("upserts the label and returns the row", () => {
    expect(roleInsertSql("staff", "Staff")).toContain(`VALUES ('staff', 'Staff'`);
    expect(roleInsertSql("staff", "Staff")).toContain("ON CONFLICT");
    expect(roleInsertSql("staff", "Staff")).toContain("RETURNING");
  });

  it.each([["Admin"], ["admin'; DROP TABLE role; --"], [""], ["1admin"]])("rejects the name %s", (name) => {
    expect(() => roleInsertSql(name, "Label")).toThrow(/Invalid role/);
  });

  it("rejects a label that could break out of the string", () => {
    expect(() => roleInsertSql("ops", "Ops' team")).toThrow(/Invalid label/);
  });
});
