import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { genResource } from "../src/commands/gen.js";
import { rmResource } from "../src/commands/rm.js";
import { syncTypes } from "../src/commands/sync.js";

const scratch = mkdtempSync(join(import.meta.dirname, ".tmp-rm-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const quiet = { log: () => {}, skipMigration: true };

async function app() {
  const root = join(scratch, `app-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { vinext: "1" } }));
  await genResource("Company", { ...quiet, cwd: root, fields: "name:string" });
  await genResource("Tag", { ...quiet, cwd: root, fields: "label:string!" });
  await genResource("Contact", { ...quiet, cwd: root, fields: "name:string, company:belongsTo(Company)?" });
  return root;
}

const TAG_FILES = [
  "resources/tag.resource.ts",
  "db/schema/tags.ts",
  "app/api/tags/route.ts",
  "app/api/tags/[id]/route.ts",
  "resources/tag.client.ts",
  "resources/tag.validators.ts",
];

const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");

describe("flare rm resource", () => {
  it("removes every generated file, empty route folders, and shared references", async () => {
    const root = await app();
    const { removed } = await rmResource("tag", { ...quiet, cwd: root });

    expect(removed).toEqual([...TAG_FILES].sort());
    for (const path of TAG_FILES) expect(existsSync(join(root, path)), path).toBe(false);
    expect(existsSync(join(root, "app/api/tags"))).toBe(false);
    expect(existsSync(join(root, "app/api/contacts/route.ts"))).toBe(true);
    expect(read(root, "resources/index.ts")).not.toContain("tag");
    expect(read(root, "db/schema.ts")).not.toContain("tags");
    expect(await syncTypes({ cwd: root, check: true, log: () => {} })).toBe(0);
  });

  it("refuses while other resources reference it, even with --force", async () => {
    const root = await app();
    await expect(rmResource("Company", { ...quiet, cwd: root, force: true })).rejects.toThrow(
      "Can't remove Company: Contact.companyId still references it. Remove those fields first.",
    );
    expect(existsSync(join(root, "resources/company.resource.ts"))).toBe(true);
  });

  it("refuses when files contain hand-written code, listing each, unless --force", async () => {
    const root = await app();
    writeFileSync(join(root, "app/api/tags/route.ts"), `${read(root, "app/api/tags/route.ts")}\nexport const HEAD = () => new Response(null);\n`);
    writeFileSync(join(root, "db/schema/tags.ts"), read(root, "db/schema/tags.ts").replace('label: text("label")', 'label: text("tag_label")'));
    writeFileSync(join(root, "resources/tag.resource.ts"), read(root, "resources/tag.resource.ts").replace('name: "Tag",', 'name: "Tag",\n  icon: "tag",'));

    const error = await rmResource("Tag", { ...quiet, cwd: root }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("app/api/tags/route.ts: has hand-written code outside the generated block");
    expect((error as Error).message).toContain("db/schema/tags.ts: has hand edits inside the generated block");
    expect((error as Error).message).toContain("resources/tag.resource.ts: has hand-written changes outside the fields block");
    for (const path of TAG_FILES) expect(existsSync(join(root, path)), path).toBe(true);

    await rmResource("Tag", { ...quiet, cwd: root, force: true });
    for (const path of TAG_FILES) expect(existsSync(join(root, path)), path).toBe(false);
  });

  it("allows edits inside the descriptor's fields block (the normal way to evolve a resource)", async () => {
    const root = await app();
    writeFileSync(join(root, "resources/tag.resource.ts"), read(root, "resources/tag.resource.ts").replace("field.string({ unique: true })", 'field.string({ unique: true, label: "Tag" })'));
    await expect(rmResource("Tag", { ...quiet, cwd: root })).resolves.toBeDefined();
  });

  it("cleans up orphaned files after the descriptor was already deleted", async () => {
    const root = await app();
    unlinkSync(join(root, "resources/tag.resource.ts"));
    const { removed } = await rmResource("Tag", { ...quiet, cwd: root });
    expect(removed).toEqual(TAG_FILES.filter((path) => path !== "resources/tag.resource.ts").sort());
    expect(await syncTypes({ cwd: root, check: true, log: () => {} })).toBe(0);
  });

  it("explains unknown resources", async () => {
    const root = await app();
    await expect(rmResource("Nope", { ...quiet, cwd: root })).rejects.toThrow(/No resource "Nope"/);
  });
});
