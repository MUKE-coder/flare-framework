import { defineResource, field, type Resource } from "@flare/core";
import { describe, expect, it } from "vitest";
import type { LoadedResource } from "../src/generator/load.js";
import {
  renderClient,
  renderCollectionRoute,
  renderItemRoute,
  renderRegistry,
  renderSchemaIndex,
  renderTableModule,
} from "../src/generator/render.js";

const loaded = (resource: Resource, stem: string): LoadedResource => ({ resource, stem, file: `resources/${stem}.resource.ts` });

const company = loaded(defineResource({ name: "Company", fields: { name: field.string() } }), "company");
const contact = loaded(
  defineResource({
    name: "Contact",
    fields: {
      name: field.string(),
      email: field.string({ format: "email", unique: true }),
      rating: field.float({ required: false }),
      vip: field.boolean({ default: false }),
      status: field.enum(["lead", "o'brien"], { default: "lead" }),
      companyId: field.belongsTo("Company", { required: false, onDelete: "set null" }),
      notes: field.hasMany("Note"),
    },
  }),
  "contact",
);
const all = [company, contact];

describe("renderTableModule", () => {
  it("renders columns, constraints, FK references, and indexes", () => {
    expect(renderTableModule(contact, all)).toBe(`import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { companies } from "./companies";

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    rating: real("rating"),
    vip: integer("vip", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ["lead","o'brien"] }).notNull().default("lead"),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql\`(cast(unixepoch('subsecond') * 1000 as integer))\`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql\`(cast(unixepoch('subsecond') * 1000 as integer))\`)
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("contacts_status_check", sql\`\${table.status} in ('lead', 'o''brien')\`),
    index("contacts_company_id_idx").on(table.companyId),
  ],
);
`);
  });

  it("renders a minimal table without extra config", () => {
    const output = renderTableModule(company, all);
    expect(output).toContain('import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";');
    expect(output).not.toContain("(table) =>");
  });

  it("types self-references so TypeScript can infer them", () => {
    const category = loaded(
      defineResource({ name: "Category", fields: { name: field.string(), parentId: field.belongsTo("Category", { required: false }) } }),
      "category",
    );
    const output = renderTableModule(category, [category]);
    expect(output).toContain('import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";');
    expect(output).toContain("references((): AnySQLiteColumn => categories.id");
  });

  it("fails clearly when a belongsTo target is missing", () => {
    expect(() => renderTableModule(contact, [contact])).toThrow(/no Company resource/);
  });
});

describe("route, client, and registry rendering", () => {
  it("renders thin route handlers with plain named exports", () => {
    const collection = renderCollectionRoute(contact);
    expect(collection).toContain('import contactResource from "@/resources/contact.resource";');
    expect(collection).toContain("table: contacts,");
    expect(collection).toMatch(/export const GET = handlers\.collection\.GET;\nexport const POST = handlers\.collection\.POST;/);
    expect(renderItemRoute(contact)).toMatch(/export const (GET|PATCH|PUT|DELETE) = handlers\.item\.\1;/g);
  });

  it("renders a typed client bound to the resource slug", () => {
    expect(renderClient(contact)).toContain('export const contactClient = createResourceClient<typeof contactResource>("/api/contacts");');
    expect(renderClient(contact)).toContain("export type Contact = typeof contactResource.$types.record;");
  });

  it("renders the registry and schema index in a stable order", () => {
    expect(renderRegistry(all)).toContain("export const resources = [companyResource, contactResource] as const;");
    expect(renderSchemaIndex([contact, company])).toBe('export * from "./schema/companies";\nexport * from "./schema/contacts";\n');
  });
});
