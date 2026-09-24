import { defineResource, field, type Resource } from "@flaredev/core";
import { describe, expect, it } from "vitest";
import type { LoadedResource } from "../src/generator/load.js";
import { backReferences, enumTypeName, renderPrismaEnums, renderPrismaModel, renderPrismaSchema } from "../src/generator/prisma.js";

const loaded = (resource: Resource, stem: string): LoadedResource => ({ resource, stem, file: `resources/${stem}.resource.ts` });

const company = loaded(defineResource({ name: "Company", fields: { name: field.string() } }), "company");

const contact = loaded(
  defineResource({
    name: "Contact",
    fields: {
      name: field.string(),
      email: field.string({ format: "email", unique: true }),
      bio: field.text({ required: false }),
      rating: field.float({ required: false }),
      seats: field.int({ default: 1 }),
      vip: field.boolean({ default: false }),
      bornOn: field.date({ required: false }),
      status: field.enum(["lead", "in progress"], { default: "lead" }),
      tags: field.multiselect(["a", "b"]),
      avatar: field.file(["image"], { required: false }),
      companyId: field.belongsTo("Company", { required: false, onDelete: "set null" }),
    },
  }),
  "contact",
);

const withHasMany = loaded(
  defineResource({ name: "Company", fields: { name: field.string(), contacts: field.hasMany("Contact") } }),
  "company",
);

const all = [company, contact];

describe("renderPrismaModel", () => {
  const model = renderPrismaModel(contact, all);

  it("maps each field kind to its Postgres type", () => {
    expect(model).toContain("id String @id @default(uuid())");
    expect(model).toContain("name String");
    expect(model).toContain("bio String? @db.Text");
    expect(model).toContain("rating Float?");
    expect(model).toContain("seats Int @default(1)");
    expect(model).toContain("vip Boolean @default(false)");
    expect(model).toContain('bornOn DateTime? @map("born_on") @db.Date');
    expect(model).toContain("avatar String?");
  });

  it("uses a real Postgres array for a multiselect rather than JSON", () => {
    expect(model).toContain("tags String[]");
    // An array field is never null in Postgres; it is empty.
    expect(model).not.toContain("tags String[]?");
  });

  it("gives an enum field its own type, and maps values that aren't identifiers", () => {
    expect(model).toContain("status ContactStatus @default(lead)");
    const [block] = renderPrismaEnums(contact.resource);
    expect(block).toContain("enum ContactStatus {");
    expect(block).toContain("  lead");
    expect(block).toContain('  in_progress @map("in progress")');
  });

  it("writes a belongsTo as the scalar and the relation, with the right delete rule", () => {
    expect(model).toContain('companyId String? @map("company_id")');
    expect(model).toContain("company Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)");
    expect(model).toContain("@@index([companyId])");
  });

  it("writes a hasMany as a back-reference with no column of its own", () => {
    const back = renderPrismaModel(withHasMany, [withHasMany, contact]);
    expect(back).toContain("contacts Contact[]");
    expect(back).not.toContain("contacts String");
  });

  it("adds the other side of a relation the descriptor never declared", () => {
    // Drizzle needs only the belongsTo; Prisma refuses a schema with one side missing.
    const model = renderPrismaModel(company, all);
    expect(model).toContain("contacts Contact[]");
  });

  it("names both sides when one model points at another twice", () => {
    const order = loaded(
      defineResource({
        name: "Order",
        fields: {
          billToId: field.belongsTo("Company"),
          shipToId: field.belongsTo("Company", { required: false, onDelete: "set null" }),
        },
      }),
      "order",
    );
    const pair = [company, order];
    const orderModel = renderPrismaModel(order, pair);
    const companyModel = renderPrismaModel(company, pair);

    expect(orderModel).toContain('billTo Company @relation("Order_billToId", fields: [billToId], references: [id]');
    expect(orderModel).toContain('shipTo Company? @relation("Order_shipToId", fields: [shipToId], references: [id]');
    expect(companyModel).toContain('billToOrders Order[] @relation("Order_billToId")');
    expect(companyModel).toContain('shipToOrders Order[] @relation("Order_shipToId")');
  });

  it("keeps the timestamps and the table name the other stack uses", () => {
    expect(model).toContain('createdAt DateTime @default(now()) @map("created_at")');
    expect(model).toContain("updatedAt DateTime @updatedAt");
    expect(model).toContain('@@map("contacts")');
  });

  it("indexes what a list sorts and filters by", () => {
    expect(model).toContain("@@index([createdAt])");
    expect(model).toContain("@@index([status])");
  });

  it("refuses a relation to a resource that doesn't exist yet", () => {
    const orphan = loaded(defineResource({ name: "Deal", fields: { companyId: field.belongsTo("Nowhere") } }), "deal");
    expect(() => renderPrismaModel(orphan, [orphan])).toThrow(/there is no Nowhere resource/);
  });
});

describe("renderPrismaSchema", () => {
  const schema = renderPrismaSchema(all);

  it("writes the enums and every model, and nothing that isn't generated", () => {
    expect(schema).toContain("enum ContactStatus {");
    expect(schema).toContain("model Company {");
    expect(schema).toContain("model Contact {");
    // The generator block and the datasource live in base.prisma, which is hand-edited.
    expect(schema).not.toContain("datasource");
    expect(schema).not.toContain("generator client");
  });

  it("orders models the same way every time, so the file doesn't churn", () => {
    expect(renderPrismaSchema([contact, company])).toBe(schema);
    expect(schema.indexOf("model Company")).toBeLessThan(schema.indexOf("model Contact"));
  });
});

describe("enumTypeName", () => {
  it("is the model and the field, so two resources can both have a status", () => {
    expect(enumTypeName("Contact", "status")).toBe("ContactStatus");
    expect(enumTypeName("OrderItem", "kind")).toBe("OrderItemKind");
  });
});

describe("backReferences", () => {
  it("finds every model pointing at this one", () => {
    expect(backReferences(company.resource, all)).toEqual([{ field: "contacts", from: "Contact", relationName: undefined }]);
  });

  it("finds none for a model nothing points at", () => {
    expect(backReferences(contact.resource, all)).toEqual([]);
  });
});
