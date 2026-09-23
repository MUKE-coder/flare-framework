import { describe, expect, expectTypeOf, it } from "vitest";
import {
  camelCase,
  createValidators,
  clientResource,
  defineResource,
  field,
  humanize,
  kebabCase,
  mimeTypesFor,
  pascalCase,
  pluralize,
  relationGraph,
  snakeCase,
  storedFields,
} from "../src/resource/index.js";

describe("naming", () => {
  it("converts between cases", () => {
    expect(pascalCase("order item")).toBe("OrderItem");
    expect(camelCase("OrderItem")).toBe("orderItem");
    expect(snakeCase("OrderItem")).toBe("order_item");
    expect(kebabCase("orderItemID")).toBe("order-item-id");
    expect(snakeCase("HTMLPage")).toBe("html_page");
    expect(humanize("companyId")).toBe("Company id");
  });

  it("pluralizes common English nouns", () => {
    expect(pluralize("Contact")).toBe("Contacts");
    expect(pluralize("Category")).toBe("Categories");
    expect(pluralize("Day")).toBe("Days");
    expect(pluralize("Address")).toBe("Addresses");
    expect(pluralize("Box")).toBe("Boxes");
    expect(pluralize("Person")).toBe("People");
    expect(pluralize("OrderItem")).toBe("OrderItems");
    expect(pluralize("Equipment")).toBe("Equipment");
  });
});

const contact = defineResource({
  name: "Contact",
  icon: "users",
  fields: {
    name: field.string({ maxLength: 120 }),
    email: field.string({ format: "email", unique: true }),
    phone: field.string({ required: false }),
    bio: field.text({ required: false }),
    age: field.int({ required: false, min: 0, max: 150 }),
    score: field.float({ default: 0 }),
    vip: field.boolean({ default: false }),
    birthday: field.date({ required: false }),
    lastSeenAt: field.datetime({ required: false }),
    status: field.enum(["lead", "customer", "churned"], { default: "lead" }),
    avatar: field.file(["image"], { required: false }),
    companyId: field.belongsTo("Company", { required: false, onDelete: "set null" }),
    notes: field.hasMany("Note"),
  },
});

describe("defineResource", () => {
  it("derives names, labels, and defaults", () => {
    expect(contact).toMatchObject({
      name: "Contact",
      table: "contacts",
      slug: "contacts",
      label: "Contact",
      pluralLabel: "Contacts",
      icon: "users",
      titleField: "name",
      defaultSort: { field: "createdAt", direction: "desc" },
      perPage: 25,
    });
    expect(contact.fields.companyId.label).toBe("Company");
    expect(contact.fields.lastSeenAt.label).toBe("Last seen at");
    expect(contact.fields.bio).toMatchObject({ required: false, list: false, searchable: false });
    expect(contact.fields.name.required).toBe(true);
    expect(storedFields(contact).map(([key]) => key)).not.toContain("notes");
  });

  it("derives multi-word table and slug names", () => {
    const item = defineResource({ name: "OrderItem", fields: { quantity: field.int() } });
    expect(item).toMatchObject({ table: "order_items", slug: "order-items", pluralLabel: "Order items", titleField: "quantity" });
  });

  it("stays serializable (plain data only)", () => {
    expect(JSON.parse(JSON.stringify(contact))).toEqual(contact);
  });

  it.each([
    [{ name: "contact", fields: { a: field.string() } }, /PascalCase/],
    [{ name: "Contact", fields: {} }, /at least one field/],
    [{ name: "Contact", fields: { Name: field.string() } }, /camelCase/],
    [{ name: "Contact", fields: { id: field.string() } }, /added automatically/],
    [{ name: "Contact", fields: { company: field.belongsTo("Company") } }, /must end in "Id"/],
    [{ name: "Contact", fields: { companyId: field.belongsTo("company") } }, /PascalCase resource/],
    [{ name: "Contact", fields: { companyId: field.belongsTo("Company", { onDelete: "set null" }) } }, /required: false/],
    [{ name: "Contact", fields: { s: field.enum(["a", "a"]) } }, /duplicate options/],
    [{ name: "Contact", fields: { f: field.file([]) } }, /at least one category/],
    [{ name: "Contact", fields: { a: field.string() }, titleField: "nope" }, /titleField/],
    [{ name: "Contact", fields: { a: field.string() }, defaultSort: { field: "nope", direction: "asc" } }, /defaultSort/],
    [{ name: "Contact", fields: { a: field.string() }, perPage: 1000 }, /perPage/],
  ])("rejects invalid config %#", (config, message) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => defineResource(config as any)).toThrow(message);
  });

  it("rejects an enum default outside its options", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => defineResource({ name: "A", fields: { s: field.enum(["a", "b"], { default: "c" as any }) } })).toThrow(
      /isn't one of its options/,
    );
  });
});

describe("createValidators", () => {
  const { create, update } = createValidators(contact);
  const valid = { name: " Ada ", email: "ada@example.com" };

  it("accepts a minimal valid create body and trims strings", () => {
    const result = create.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Ada", email: "ada@example.com" });
  });

  it("requires required fields without defaults", () => {
    const result = create.safeParse({ name: "Ada" });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.path.join("."))).toEqual(["email"]);
  });

  it("rejects empty required strings, bad formats, and limits", () => {
    const bad = create.safeParse({
      name: "   ",
      email: "not-an-email",
      age: 1.5,
      status: "vip",
      birthday: "2026-02-30",
      lastSeenAt: "yesterday",
      avatar: "../etc/passwd",
    });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((i) => i.path[0]).sort()).toEqual(
      ["age", "avatar", "birthday", "email", "lastSeenAt", "name", "status"].sort(),
    );
    expect(create.safeParse({ ...valid, name: "x".repeat(121) }).success).toBe(false);
    expect(create.safeParse({ ...valid, age: 151 }).success).toBe(false);
  });

  it("only accepts file keys issued for that field", () => {
    // The table is "contacts", so avatar uploads live under contacts/avatar/.
    expect(create.safeParse({ ...valid, avatar: "contacts/avatar/2026/09/abc-me.png" }).success).toBe(true);
    for (const avatar of ["deals/contract/2026/09/abc-secret.pdf", "contacts/other/x.png", "uploads/x.png"]) {
      const result = update.safeParse({ avatar });
      expect(result.success, avatar).toBe(false);
      expect(result.error!.issues[0]!.message).toBe("This file wasn't uploaded for this field");
    }
    expect(update.safeParse({ avatar: null }).success).toBe(true);
  });

  it("allows null only for optional fields", () => {
    expect(create.safeParse({ ...valid, phone: null, companyId: null }).success).toBe(true);
    expect(create.safeParse({ ...valid, score: null }).success).toBe(false);
  });

  it("rejects unknown keys, ids, and timestamps (no mass assignment)", () => {
    for (const extra of [{ id: "x" }, { createdAt: "2026-01-01" }, { isAdmin: true }, { notes: [] }]) {
      expect(create.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });

  it("makes every field optional on update, but still validates provided values", () => {
    expect(update.safeParse({}).success).toBe(true);
    expect(update.safeParse({ status: "customer" }).success).toBe(true);
    expect(update.safeParse({ email: "nope" }).success).toBe(false);
    expect(update.safeParse({ name: null }).success).toBe(false);
  });

  it("validates enum defaults and datetimes with offsets", () => {
    expect(create.safeParse({ ...valid, lastSeenAt: "2026-09-17T10:00:00+03:00" }).success).toBe(true);
  });
});

describe("type inference", () => {
  it("infers create, update, and record types from the descriptor", () => {
    type Create = typeof contact.$types.create;
    type Rec = typeof contact.$types.record;

    expectTypeOf<Create>().toEqualTypeOf<{
      name: string;
      email: string;
      phone?: string | null;
      bio?: string | null;
      age?: number | null;
      score?: number;
      vip?: boolean;
      birthday?: string | null;
      lastSeenAt?: string | null;
      status?: "lead" | "customer" | "churned";
      avatar?: string | null;
      companyId?: string | null;
    }>();
    expectTypeOf<Rec["status"]>().toEqualTypeOf<"lead" | "customer" | "churned">();
    expectTypeOf<Rec["phone"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Rec["vip"]>().toEqualTypeOf<boolean>();
    expectTypeOf<Rec>().toHaveProperty("id");
    expectTypeOf<Rec>().not.toHaveProperty("notes");
    expectTypeOf<typeof contact.$types.update>().toEqualTypeOf<Partial<Create>>();
  });
});

describe("mimeTypesFor", () => {
  it("expands file categories without duplicates", () => {
    expect(mimeTypesFor(["pdf", "image", "pdf"])).toEqual([
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/avif",
    ]);
  });
});

describe("relationGraph", () => {
  const company = defineResource({ name: "Company", fields: { name: field.string(), deals: field.hasMany("Deal") } });
  const deal = defineResource({
    name: "Deal",
    fields: { title: field.string(), companyId: field.belongsTo("Company", { onDelete: "cascade" }), tags: field.hasMany("Tag") },
  });

  it("resolves belongsTo and inverse hasMany, and lists pending targets", () => {
    const graph = relationGraph([company, deal]);
    expect(graph.byResource.Deal!.belongsTo).toEqual([
      { key: "companyId", name: "company", target: "Company", required: true, onDelete: "cascade", relationName: "deals_company_id" },
    ]);
    expect(graph.byResource.Company!.hasMany).toEqual([
      { key: "deals", target: "Deal", foreignKey: "companyId", relationName: "deals_company_id" },
    ]);
    expect(graph.pending).toEqual([{ resource: "Deal", key: "tags", target: "Tag" }]);
  });

  it("rejects missing belongsTo targets and hasMany without a matching belongsTo", () => {
    expect(() => relationGraph([deal])).toThrow(/no Company resource/);
    const orphan = defineResource({ name: "Deal", fields: { title: field.string() } });
    expect(() => relationGraph([company, orphan])).toThrow(/Deal has no companyId: belongsTo\(Company\) field/);
  });

  it("rejects relation names that collide with fields", () => {
    const clash = defineResource({
      name: "Deal",
      fields: { company: field.string(), companyId: field.belongsTo("Company") },
    });
    const plainCompany = defineResource({ name: "Company", fields: { name: field.string() } });
    expect(() => relationGraph([plainCompany, clash])).toThrow(/collides with the Deal.company field/);
  });
});

describe("clientResource", () => {
  const order = defineResource({
    name: "Order",
    fields: { reference: field.string(), quantity: field.int() },
    hooks: { beforeCreate: (input) => input },
    computed: { doubled: (record) => Number(record.quantity) * 2 },
  });

  it("leaves nothing behind that a client component can't be sent", () => {
    // React refuses a function it wasn't told to expose, so a resource with hooks would
    // break every dashboard page that hands one to a client component.
    const forClient = clientResource(order);
    const functions = Object.entries(forClient).filter(([, value]) => typeof value === "function");
    expect(functions).toEqual([]);
    expect(JSON.parse(JSON.stringify(forClient))).toMatchObject({ name: "Order", slug: "orders" });
  });

  it("keeps everything that describes the resource", () => {
    const forClient = clientResource(order);
    expect(forClient.fields.reference!.label).toBe("Reference");
    expect(forClient.titleField).toBe("reference");
    expect(forClient.perPage).toBe(order.perPage);
    expect(forClient.defaultSort).toEqual(order.defaultSort);
  });
});
