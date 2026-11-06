import { defineResource, field, relationGraph, type Resource } from "@flaredev/core";
import { describe, expect, it } from "vitest";
import { parseField } from "../src/generator/grammar.js";
import type { LoadedResource } from "../src/generator/load.js";
import { authUserBackReferences, renderPrismaModel, withAuthUserBackReferences } from "../src/generator/prisma.js";
import { renderRelations, renderTableModule } from "../src/generator/render.js";

const loaded = (resource: Resource, stem: string): LoadedResource => ({ resource, stem, file: `resources/${stem}.resource.ts` });

/** The case from issue #73: "who reported it", on a resource with nothing else to it. */
const item = loaded(
  defineResource({
    name: "Item",
    fields: {
      title: field.string(),
      reporterId: field.belongsTo("User", { required: false }),
    },
  }),
  "item",
);

/** Two relations to the same user, which is the case Prisma cannot name for itself. */
const ticket = loaded(
  defineResource({
    name: "Ticket",
    fields: {
      subject: field.string(),
      reportedById: field.belongsTo("User", { required: false }),
      assignedToId: field.belongsTo("User", { required: false }),
    },
  }),
  "ticket",
);

describe("belongsTo(User) in the grammar and the graph (#73)", () => {
  it("parses as a relation, not a plain string", () => {
    const parsed = parseField("reporter:belongsTo(User)?");
    expect(parsed.kind).toBe("belongsTo");
    expect(parsed.target).toBe("User");
  });

  it("resolves without a User resource existing", () => {
    const graph = relationGraph([item.resource]);
    expect(graph.byResource.Item!.belongsTo).toEqual([
      expect.objectContaining({ key: "reporterId", name: "reporter", target: "User" }),
    ]);
  });

  it("defaults an optional one to set null, so closing an account is not blocked", () => {
    expect(relationGraph([item.resource]).byResource.Item!.belongsTo[0]!.onDelete).toBe("set null");
  });

  it("defaults a required one to restrict, because a required column cannot be nulled", () => {
    const required = defineResource({ name: "Note", fields: { body: field.string(), authorId: field.belongsTo("User") } });
    expect(relationGraph([required]).byResource.Note!.belongsTo[0]!.onDelete).toBe("restrict");
  });

  it("still refuses a target that is neither a resource nor User", () => {
    const bad = defineResource({ name: "Item", fields: { ownerId: field.belongsTo("Ghost") } });
    expect(() => relationGraph([bad])).toThrow(/there is no Ghost resource/);
  });
});

describe("belongsTo(User) on the Cloudflare stack (#73)", () => {
  const schema = renderTableModule(item, [item]);

  it("references the auth table, imported from db/auth-schema", () => {
    expect(schema).toContain('import { user } from "../auth-schema";');
    expect(schema).toContain('references(() => user.id, { onDelete: "set null" })');
  });

  it("indexes the foreign key, like any other relation", () => {
    expect(schema).toMatch(/index\("items_reporter_id_idx"\)/);
  });

  it("gives the relation a one() side in db/relations.ts", () => {
    const relations = renderRelations([item]);
    expect(relations).toContain('import { user } from "./auth-schema";');
    expect(relations).toContain("reporter: one(user, { fields: [items.reporterId], references: [user.id] })");
  });

  it("names no relationName for the user side, since auth-schema declares no many() half", () => {
    // Naming one half of a relation Drizzle cannot complete is how you get
    // "there is not enough information to infer relation".
    const relations = renderRelations([item]);
    expect(relations).not.toMatch(/one\(user, \{[^}]*relationName/);
  });
});

describe("belongsTo(User) on the Next.js stack (#73)", () => {
  const model = renderPrismaModel(item, [item]);

  it("writes a named relation to the User model", () => {
    expect(model).toContain('reporterId String? @map("reporter_id")');
    expect(model).toContain('reporter User? @relation("Item_reporterId", fields: [reporterId], references: [id], onDelete: SetNull)');
  });

  it("produces the back-reference model User needs", () => {
    expect(authUserBackReferences([item])).toEqual(['reporterItems Item[] @relation("Item_reporterId")']);
  });

  it("keeps two relations from one resource apart", () => {
    expect(authUserBackReferences([ticket])).toEqual([
      'assignedToTickets Ticket[] @relation("Ticket_assignedToId")',
      'reportedByTickets Ticket[] @relation("Ticket_reportedById")',
    ]);
  });

  it("refuses hasMany(User) rather than writing a schema that will not generate", () => {
    const wrong = loaded(defineResource({ name: "Team", fields: { name: field.string(), members: field.hasMany("User") } }), "team");
    expect(() => renderPrismaModel(wrong, [wrong])).toThrow(/Better Auth owns that table/);
  });
});

describe("splicing the back-references into base.prisma (#73)", () => {
  const BASE = `datasource db {
  provider = "postgresql"
}

model User {
  id    String @id @default(uuid())
  email String @unique

  sessions Session[]

  @@map("users")
}

model Session {
  id String @id
}
`;

  it("puts the block inside model User, above its attributes", () => {
    const out = withAuthUserBackReferences(BASE, authUserBackReferences([item]))!;
    expect(out).toContain('reporterItems Item[] @relation("Item_reporterId")');
    expect(out.indexOf("generated:start")).toBeGreaterThan(out.indexOf("model User {"));
    expect(out.indexOf("generated:end")).toBeLessThan(out.indexOf('@@map("users")'));
    // And nothing outside model User moved.
    expect(out).toContain("model Session {");
    expect(out).toContain('provider = "postgresql"');
  });

  it("is idempotent: splicing twice changes nothing the second time", () => {
    const once = withAuthUserBackReferences(BASE, authUserBackReferences([item]))!;
    expect(withAuthUserBackReferences(once, authUserBackReferences([item]))).toBe(once);
  });

  it("replaces the block when the fields change rather than adding a second one", () => {
    const once = withAuthUserBackReferences(BASE, authUserBackReferences([item]))!;
    const twice = withAuthUserBackReferences(once, authUserBackReferences([ticket]))!;
    expect(twice.match(/generated:start/g)).toHaveLength(1);
    expect(twice).not.toContain("reporterItems");
    expect(twice).toContain("assignedToTickets");
  });

  it("takes the block back out when the last belongsTo(User) field goes", () => {
    const once = withAuthUserBackReferences(BASE, authUserBackReferences([item]))!;
    const removed = withAuthUserBackReferences(once, [])!;
    expect(removed).not.toContain("generated:start");
    expect(removed).not.toContain("reporterItems");
    expect(removed).toContain('@@map("users")');
  });

  it("leaves a file with nothing to do exactly as it was", () => {
    expect(withAuthUserBackReferences(BASE, [])).toBe(BASE);
  });

  it("says so rather than guessing when there is no model User", () => {
    expect(withAuthUserBackReferences("model Session {\n  id String @id\n}\n", authUserBackReferences([item]))).toBeNull();
  });
});
