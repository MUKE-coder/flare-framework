import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineResource } from "@flaredev/core";
import { afterAll, describe, expect, it } from "vitest";
import { genResource } from "../src/commands/gen.js";
import { renderDescriptor, resourceName, toField } from "../src/generator/descriptor.js";
import { parseFields } from "../src/generator/grammar.js";
import { hashBlock } from "../src/generator/markers.js";

// Inside the package so generated files can resolve @flaredev/core.
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
    expect(renderDescriptor("Contact", parseFields("name:string, email:string"))).toBe(`import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Contact",
  // icon: "file-text",                              // any lucide-react name
  // group: "Sales",                                 // sidebar heading
  // titleField: "name",                             // what lists and pickers show
  // defaultSort: { field: "createdAt", direction: "desc" },
  // perPage: 25,                                    // rows per page
  // softDelete: true,                               // keep deleted rows, with a Trash view
  // rateLimit: { create: "10/min", "*": "120/min" },
  // Uncomment what you need. Hooks, computed values, table and slug:
  // https://flare-docs.codetotech.com/concepts/resource-descriptor/

  fields: {
    // generated:start hash=${hashBlock(block)}
    name: field.string(),
    email: field.string({ format: "email" }),
    // generated:end
  },
});
`);
  });

  it("writes the keys it was given, and suggests the rest", () => {
    // The point of the commented block: a setting you can see is one you will use.
    // A setting you answered is real code, not a suggestion.
    const rendered = renderDescriptor("Contact", parseFields("name:string"), { icon: "users", group: "Sales" });
    expect(rendered).toContain(`  icon: "users",`);
    expect(rendered).toContain(`  group: "Sales",`);
    expect(rendered).not.toContain(`// icon:`);
    expect(rendered).not.toContain(`// group:`);
    // Still suggested, because they were not asked for.
    expect(rendered).toContain(`// softDelete: true,`);
    expect(rendered).toContain(`// titleField: "name",`);
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
      // A new resource is admin-only until you widen it, so the policy arrives with it.
      "policies/order-item.policy.ts",
      "db/schema/order_items.ts",
      "app/api/order-items/route.ts",
      "app/api/order-items/[id]/route.ts",
      "resources/order-item.client.ts",
      "resources/order-item.validators.ts",
      "app/dashboard/order-items/page.tsx",
      "app/dashboard/order-items/[id]/page.tsx",
      "app/dashboard/order-items/new/page.tsx",
      "app/dashboard/order-items/[id]/edit/page.tsx",
      // A skeleton beside each page, shaped like the page it waits for.
      "app/dashboard/order-items/loading.tsx",
      "app/dashboard/order-items/new/loading.tsx",
      "app/dashboard/order-items/[id]/loading.tsx",
      "app/dashboard/order-items/[id]/edit/loading.tsx",
      // The descriptor registry is shared by both stacks; the schema files are not.
      "resources/index.ts",
      "db/relations.ts",
      "resources/server.ts",
      "db/schema.ts",
      "policies/index.ts",
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
