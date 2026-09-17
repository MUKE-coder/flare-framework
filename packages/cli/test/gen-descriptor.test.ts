import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineResource } from "@flare/core";
import { afterAll, describe, expect, it } from "vitest";
import { genResource } from "../src/commands/gen.js";
import { renderDescriptor, resourceName, toField } from "../src/generator/descriptor.js";
import { parseFields } from "../src/generator/grammar.js";
import { hashBlock } from "../src/generator/markers.js";

// Inside the package so generated files can resolve @flare/core.
const scratch = mkdtempSync(join(import.meta.dirname, ".tmp-gen-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const EVERYTHING =
  "title:string, email:string!, bio:text?, qty:int, price:float?, active:boolean, born:date?, seenAt:datetime?, " +
  "status:enum(draft,published), avatar:file:[image,pdf]?, company:belongsTo(Company)?, owner:belongsTo(User), notes:hasMany(Note)";

describe("renderDescriptor", () => {
  it("renders source that evaluates to the parsed descriptor", async () => {
    const fields = parseFields(EVERYTHING);
    const source = renderDescriptor("Post", fields);
    const file = join(scratch, "post.resource.ts");
    writeFileSync(file, source);

    const loaded = (await import(pathToFileURL(file).href)).default;
    const expected = defineResource({ name: "Post", fields: Object.fromEntries(fields.map((f) => [f.key, toField(f)])) });
    expect(loaded).toEqual(expected);
    expect(loaded.fields.companyId).toMatchObject({ kind: "belongsTo", target: "Company", required: false, onDelete: "set null" });
    expect(loaded.fields.ownerId).toMatchObject({ required: true });
    expect(loaded.fields.ownerId.onDelete).toBeUndefined();
  });

  it("wraps fields in generated markers and keeps output readable", () => {
    const block = 'name: field.string(),\nemail: field.string({ format: "email" }),\n';
    expect(renderDescriptor("Contact", parseFields("name:string, email:string"))).toBe(`import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Contact",
  fields: {
    // generated:start hash=${hashBlock(block)}
    name: field.string(),
    email: field.string({ format: "email" }),
    // generated:end
  },
});
`);
  });

  it("refuses to render descriptors the runtime would reject", () => {
    expect(() => renderDescriptor("Post", parseFields("id:string"))).toThrow(/added automatically/);
  });
});

describe("resourceName", () => {
  it("normalizes names", () => {
    expect(resourceName("order_item")).toBe("OrderItem");
    expect(resourceName("contact")).toBe("Contact");
    expect(() => resourceName("123")).toThrow(/Invalid resource name/);
  });
});

describe("genResource", () => {
  function app() {
    const root = join(scratch, `app-${Math.random().toString(36).slice(2)}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { vinext: "1" } }));
    return root;
  }

  it("writes resources/<kebab>.resource.ts from a nested cwd", async () => {
    const root = app();
    mkdirSync(join(root, "app", "deep"), { recursive: true });
    const result = await genResource("order_item", { fields: "qty:int", cwd: join(root, "app", "deep"), log: () => {}, skipMigration: true });
    expect(result.name).toBe("OrderItem");
    expect(result.written.map((w) => w.path)).toEqual([
      "resources/order-item.resource.ts",
      "db/schema/order_items.ts",
      "app/api/order-items/route.ts",
      "app/api/order-items/[id]/route.ts",
      "resources/order-item.client.ts",
      "resources/order-item.validators.ts",
      "app/admin/order-items/page.tsx",
      "app/admin/order-items/new/page.tsx",
      "app/admin/order-items/[id]/edit/page.tsx",
      "db/relations.ts",
      "resources/index.ts",
      "resources/server.ts",
      "db/schema.ts",
    ]);
    expect(result.written.slice(1).every((w) => w.outcome === "create")).toBe(true);
    expect(readFileSync(join(root, "lib/api.ts"), "utf8")).toContain("export const authorize");
    expect(readFileSync(join(root, "resources/order-item.resource.ts"), "utf8")).toContain('name: "OrderItem"');
  });

  it("requires --fields for a new resource", async () => {
    const root = app();
    const opts = { cwd: root, log: () => {}, skipMigration: true };
    await expect(genResource("Contact", opts)).rejects.toThrow(/--fields is required/);
    await genResource("Contact", { ...opts, fields: "name:string" });
    // Re-running for an existing resource is now an update, not an error.
    const again = await genResource("Contact", { ...opts, fields: "name:string" });
    expect(again.mode).toBe("update");
  });

  it("refuses a belongsTo whose target doesn't exist, before writing anything", async () => {
    const root = app();
    await expect(
      genResource("Contact", { cwd: root, log: () => {}, skipMigration: true, fields: "company:belongsTo(Company)" }),
    ).rejects.toThrow(/Generate Company first/);
    expect(() => readFileSync(join(root, "resources/contact.resource.ts"))).toThrow();
  });
});
