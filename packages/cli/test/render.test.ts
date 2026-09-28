import { defineResource, field, type Resource } from "@flaredev/core";
import { describe, expect, it } from "vitest";
import type { LoadedResource } from "../src/generator/load.js";
import {
  renderClient,
  renderCollectionRoute,
  renderItemRoute,
  renderRegistry,
  renderRelations,
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
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
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
    index("contacts_status_idx").on(table.status),
    index("contacts_company_id_idx").on(table.companyId),
    index("contacts_created_at_idx").on(table.createdAt),
  ],
);
`);
  });

  it("indexes what the list orders by, even on a table with no other config", () => {
    const output = renderTableModule(company, all);
    expect(output).toContain('import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";');
    // Without this index, every page of a large table sorts the whole thing.
    expect(output).toContain('index("companies_created_at_idx").on(table.createdAt)');
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
  it("exports one async function per HTTP method", () => {
    const collection = renderCollectionRoute(contact);
    expect(collection).toContain('import contactResource from "@/resources/contact.resource";');
    for (const method of ["GET", "POST"]) {
      expect(collection, method).toContain(`export async function ${method}(request: Request)`);
    }
    const item = renderItemRoute(contact);
    for (const method of ["GET", "PATCH", "PUT", "DELETE"]) {
      expect(item, method).toContain(`export async function ${method}(request: Request, context: RouteContext)`);
    }
  });

  it("takes the engine from the app, never from node_modules", () => {
    // The point of copying lib/resource into the app is that a route's behaviour is
    // readable and editable there. A route that imported the framework instead would
    // quietly undo that.
    for (const route of [renderCollectionRoute(contact), renderItemRoute(contact), renderCollectionRoute(contact, "next")]) {
      expect(route).not.toContain("@flaredev/core");
      expect(route).toContain('from "@/lib/resource"');
    }
  });

  it("writes out what a request goes through, rather than delegating", () => {
    // The point of inlining: someone reading route.ts sees the policy check, the CSRF
    // guard, the JSON read and the store call, in that order, without opening a second
    // file. If this ever collapses back to `handlers.collection.GET`, that is lost.
    const collection = renderCollectionRoute(contact);
    expect(collection).toContain("export async function GET(request: Request)");
    expect(collection).toContain("export async function POST(request: Request)");
    expect(collection).not.toContain("handlers.collection");

    const order = ["action: \"create\"", "crossOrigin(request)", "readJson(request)", "store.create(", "drain(request)"];
    let at = -1;
    for (const step of order) {
      const next = collection.indexOf(step);
      expect(next, step).toBeGreaterThan(at);
      at = next;
    }
  });

  it("drains the body in a finally, so an early return can't strand it", () => {
    // An unread body breaks the *next* request through wrangler's dev proxy, and the
    // early returns above it are exactly the paths that would leave one unread.
    for (const route of [renderCollectionRoute(contact), renderItemRoute(contact)]) {
      const blocks = route.split("} finally {").slice(1);
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) expect(block.slice(0, block.indexOf("}"))).toContain("await drain(request);");
    }
  });

  it("gives every write the cross-origin guard", () => {
    const item = renderItemRoute(contact);
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      const body = item.slice(item.indexOf(`export async function ${method}`));
      expect(body.slice(0, body.indexOf("} finally")), method).toContain("crossOrigin(request)");
    }
    // A read is not a write, and blocking it would break ordinary cross-site GETs.
    const read = item.slice(item.indexOf("export async function GET"), item.indexOf("export async function PATCH"));
    expect(read).not.toContain("crossOrigin");
  });

  it("names the row adapter at the call site, per stack", () => {
    expect(renderCollectionRoute(contact)).toContain("rows: drizzleRows(contacts, getDb),");
    expect(renderCollectionRoute(contact, "next")).toContain("rows: prismaRows(prisma.contact, prisma),");
  });

  it("renders a typed client bound to the resource slug", () => {
    expect(renderClient(contact)).toContain('export const contactClient = createResourceClient<typeof contactResource>("/api/contacts");');
    expect(renderClient(contact)).toContain("export type Contact = typeof contactResource.$types.record;");
  });

  it("renders the registry and schema index in a stable order", () => {
    expect(renderRegistry(all)).toContain("export const resources = [companyResource, contactResource] as const;");
    expect(renderSchemaIndex([contact, company])).toBe(
      'export * from "./schema/companies";\nexport * from "./schema/contacts";\nexport * from "./relations";\n',
    );
    expect(renderSchemaIndex([])).toBe("");
  });

  it("renders relations for both sides with a shared relationName", () => {
    const deal = loaded(
      defineResource({
        name: "Deal",
        fields: {
          title: field.string(),
          companyId: field.belongsTo("Company"),
          ownerId: field.belongsTo("Contact", { required: false, onDelete: "set null" }),
          reviewerId: field.belongsTo("Contact", { required: false, onDelete: "set null" }),
        },
      }),
      "deal",
    );
    const companyWithDeals = loaded(
      defineResource({ name: "Company", fields: { name: field.string(), deals: field.hasMany("Deal") } }),
      "company",
    );
    const owner = loaded(
      defineResource({ name: "Contact", fields: { name: field.string(), owned: field.hasMany("Deal", { foreignKey: "ownerId" }) } }),
      "contact",
    );
    expect(renderRelations([companyWithDeals, owner, deal])).toBe(`import { relations } from "drizzle-orm";
import { companies } from "./schema/companies";
import { contacts } from "./schema/contacts";
import { deals } from "./schema/deals";

export const companiesRelations = relations(companies, ({ many }) => ({
  deals: many(deals, { relationName: "deals_company_id" }),
}));

export const contactsRelations = relations(contacts, ({ many }) => ({
  owned: many(deals, { relationName: "deals_owner_id" }),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  company: one(companies, { fields: [deals.companyId], references: [companies.id], relationName: "deals_company_id" }),
  owner: one(contacts, { fields: [deals.ownerId], references: [contacts.id], relationName: "deals_owner_id" }),
  reviewer: one(contacts, { fields: [deals.reviewerId], references: [contacts.id], relationName: "deals_reviewer_id" }),
}));
`);
    expect(renderRelations([company])).toBe("export {};\n");
  });
});
