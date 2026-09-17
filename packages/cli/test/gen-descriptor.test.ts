import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineResource } from "@flare/core";
import { afterAll, describe, expect, it } from "vitest";
import { genResource } from "../src/commands/gen.js";
import { renderDescriptor, resourceName, toField } from "../src/generator/descriptor.js";
import { parseFields } from "../src/generator/grammar.js";

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
    expect(renderDescriptor("Contact", parseFields("name:string, email:string"))).toBe(`import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Contact",
  fields: {
    // generated:start
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

  it("writes resources/<kebab>.resource.ts from a nested cwd", () => {
    const root = app();
    mkdirSync(join(root, "app", "deep"), { recursive: true });
    const result = genResource("order_item", { fields: "qty:int", cwd: join(root, "app", "deep"), log: () => {} });
    expect(result).toEqual({ name: "OrderItem", written: ["resources/order-item.resource.ts"] });
    expect(readFileSync(join(root, "resources/order-item.resource.ts"), "utf8")).toContain('name: "OrderItem"');
  });

  it("requires --fields and refuses to overwrite", () => {
    const root = app();
    expect(() => genResource("Contact", { cwd: root, log: () => {} })).toThrow(/--fields is required/);
    genResource("Contact", { fields: "name:string", cwd: root, log: () => {} });
    expect(() => genResource("Contact", { fields: "name:string", cwd: root, log: () => {} })).toThrow(/already exists/);
  });
});
