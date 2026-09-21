import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { genResource } from "../src/commands/gen.js";
import { syncTypes } from "../src/commands/sync.js";

// Inside the package so descriptors can resolve @flaredev/core.
const scratch = mkdtempSync(join(import.meta.dirname, ".tmp-sync-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function app() {
  const root = join(scratch, `app-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { vinext: "1" } }));
  const quiet = { cwd: root, log: () => {}, skipMigration: true };
  await genResource("Company", { ...quiet, fields: "name:string" });
  await genResource("Contact", { ...quiet, fields: "name:string, email:string, company:belongsTo(Company)?" });
  return root;
}

async function sync(root: string, options: { check?: boolean; force?: boolean } = {}) {
  const lines: string[] = [];
  const code = await syncTypes({ ...options, cwd: root, log: (line) => lines.push(line) });
  return { code, output: lines.join("\n") };
}

const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");

describe("flare sync-types", () => {
  it("reports an app fresh from gen as in sync", async () => {
    const root = await app();
    const { code, output } = await sync(root, { check: true });
    expect(code).toBe(0);
    expect(output).toContain("in sync");
  });

  it("regenerates derived files after a descriptor edit and flags the table change", async () => {
    const root = await app();
    const descriptor = "resources/contact.resource.ts";
    writeFileSync(join(root, descriptor), read(root, descriptor).replace("    // generated:end", '    phone: field.string({ required: false }),\n    // generated:end'));

    const check = await sync(root, { check: true });
    expect(check.code).toBe(1);
    expect(check.output).toMatch(/update\S*\s+db\/schema\/contacts\.ts/);
    expect(read(root, "db/schema/contacts.ts")).not.toContain("phone"); // --check changes nothing

    const run = await sync(root);
    expect(run.code).toBe(0);
    expect(read(root, "db/schema/contacts.ts")).toContain('phone: text("phone"),');
    expect(run.output).toContain("Tables changed");
    expect((await sync(root, { check: true })).code).toBe(0);
  });

  it("leaves hand-edited generated blocks alone and reports drift, unless --force", async () => {
    const root = await app();
    const route = "app/api/contacts/route.ts";
    const edited = read(root, route).replace("export const POST = handlers.collection.POST;", "export const POST = undefined; // disabled by hand");
    writeFileSync(join(root, route), edited);

    const run = await sync(root);
    expect(run.code).toBe(1);
    expect(run.output).toContain("Drift:");
    expect(run.output).toMatch(/drift\S*\s+app\/api\/contacts\/route\.ts/);
    expect(read(root, route)).toBe(edited);

    expect((await sync(root, { force: true })).code).toBe(0);
    expect(read(root, route)).toContain("export const POST = handlers.collection.POST;");
  });

  it("preserves hand-written code outside generated blocks", async () => {
    const root = await app();
    const client = "resources/contact.client.ts";
    writeFileSync(join(root, client), `// My notes\n${read(root, client)}\nexport const extra = 42;\n`);
    const descriptor = "resources/contact.resource.ts";
    writeFileSync(join(root, descriptor), read(root, descriptor).replace('name: "Contact",', 'name: "Contact",\n  slug: "people",'));

    const run = await sync(root);
    const text = read(root, client);
    // The old routes are now stale and reported, not silently left behind.
    expect(run.output).toContain("Orphaned:");
    expect(run.output).toContain("app/api/contacts/route.ts");
    expect(text).toContain('createResourceClient<typeof contactResource>("/api/people")');
    expect(text.startsWith("// My notes\n")).toBe(true);
    expect(text.endsWith("\nexport const extra = 42;\n")).toBe(true);
  });

  it("reports generated files orphaned by a deleted descriptor", async () => {
    const root = await app();
    // Contact references Company, so remove the dependent resource.
    unlinkSync(join(root, "resources/contact.resource.ts"));
    const run = await sync(root);
    expect(run.code).toBe(1);
    expect(run.output).toContain("Orphaned:");
    for (const path of ["db/schema/contacts.ts", "app/api/contacts/route.ts", "app/api/contacts/[id]/route.ts", "resources/contact.client.ts"]) {
      expect(run.output).toContain(path);
    }
    expect(run.output).toContain("flare rm resource Contact");
    expect(read(root, "db/schema.ts")).not.toContain("contacts");
  });

  it("refuses to overwrite hand-written files that collide with generated paths", async () => {
    const root = await app();
    writeFileSync(join(root, "resources/company.validators.ts"), "export const mine = true;\n");
    const run = await sync(root);
    expect(run.code).toBe(1);
    expect(run.output).toContain("Conflict:");
    expect(read(root, "resources/company.validators.ts")).toBe("export const mine = true;\n");
  });
});
