import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { genResource } from "../src/commands/gen.js";
import { syncTypes } from "../src/commands/sync.js";

// Inside the package so descriptors can resolve @flaredev/core.
const scratch = mkdtempSync(join(import.meta.dirname, ".tmp-regen-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const quiet = { log: () => {}, skipMigration: true };

async function app() {
  const root = join(scratch, `app-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { vinext: "1" } }));
  await genResource("Contact", { ...quiet, cwd: root, fields: "name:string, email:string" });
  return root;
}

const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");
const append = (root: string, path: string, text: string) => writeFileSync(join(root, path), read(root, path) + text);

describe("re-running gen resource (the codegen overwrite contract)", () => {
  it("updates generated blocks and preserves every line of hand-written code outside them", async () => {
    const root = await app();

    // Hand-written additions outside generated blocks, in several kinds of generated files.
    const descriptor = "resources/contact.resource.ts";
    writeFileSync(join(root, descriptor), read(root, descriptor).replace('name: "Contact",', 'name: "Contact",\n  icon: "users",'));
    append(root, "app/api/contacts/route.ts", "\nexport const HEAD = () => new Response(null, { status: 204 });\n");
    append(root, "db/schema/contacts.ts", "\nexport type ContactRow = typeof contacts.$inferSelect;\n");
    append(root, "resources/contact.client.ts", "\nexport const PAGE_SIZE = 50;\n");
    writeFileSync(join(root, "db/schema.ts"), `// my header\n${read(root, "db/schema.ts")}export * from "./custom";\n`);

    const result = await genResource("Contact", { ...quiet, cwd: root, fields: "name:string, email:string, phone:string?" });
    expect(result.mode).toBe("update");

    // Generated content moved forward...
    expect(read(root, descriptor)).toContain('phone: field.string({ required: false }),');
    expect(read(root, "db/schema/contacts.ts")).toContain('phone: text("phone"),');

    // ...and everything hand-written survived, byte for byte.
    expect(read(root, descriptor)).toContain('  icon: "users",\n');
    expect(read(root, "app/api/contacts/route.ts")).toMatch(/\nexport const HEAD = \(\) => new Response\(null, \{ status: 204 \}\);\n$/);
    expect(read(root, "db/schema/contacts.ts")).toMatch(/\nexport type ContactRow = typeof contacts\.\$inferSelect;\n$/);
    expect(read(root, "resources/contact.client.ts")).toMatch(/\nexport const PAGE_SIZE = 50;\n$/);
    expect(read(root, "db/schema.ts")).toMatch(/^\/\/ my header\n/);
    expect(read(root, "db/schema.ts")).toMatch(/export \* from "\.\/custom";\n$/);

    // The result is stable: generating again changes nothing.
    const again = await genResource("Contact", { ...quiet, cwd: root, fields: "name:string, email:string, phone:string?" });
    expect(again.written.slice(1).every((file) => file.outcome === "identical")).toBe(true);
  });

  it("regenerates from the descriptor when run without --fields", async () => {
    const root = await app();
    const descriptor = "resources/contact.resource.ts";
    // A hand edit inside the fields block (the intended way to evolve a descriptor).
    writeFileSync(join(root, descriptor), read(root, descriptor).replace("email: field.string({ format: \"email\" }),", 'email: field.string({ format: "email", unique: true }),'));

    const result = await genResource("Contact", { ...quiet, cwd: root });
    expect(result.mode).toBe("update");
    expect(read(root, "db/schema/contacts.ts")).toContain('email: text("email").notNull().unique(),');
  });

  it("refuses --fields over hand-edited descriptor fields unless --force", async () => {
    const root = await app();
    const descriptor = "resources/contact.resource.ts";
    const edited = read(root, descriptor).replace("name: field.string(),", 'name: field.string({ label: "Full name" }),');
    writeFileSync(join(root, descriptor), edited);

    await expect(genResource("Contact", { ...quiet, cwd: root, fields: "name:string, email:string, phone:string?" })).rejects.toThrow(
      /edited by hand, so --fields won't overwrite them/,
    );
    expect(read(root, descriptor)).toBe(edited);

    await genResource("Contact", { ...quiet, cwd: root, force: true, fields: "name:string, email:string, phone:string?" });
    expect(read(root, descriptor)).not.toContain("Full name");
    expect(read(root, descriptor)).toContain("phone");
  });

  it("does not write anything when the new fields are invalid", async () => {
    const root = await app();
    const before = read(root, "resources/contact.resource.ts");
    await expect(genResource("Contact", { ...quiet, cwd: root, fields: "name:string, company:belongsTo(Company)" })).rejects.toThrow(
      /Generate Company first/,
    );
    expect(read(root, "resources/contact.resource.ts")).toBe(before);
    expect((await syncTypes({ cwd: root, check: true, log: () => {} }))).toBe(0);
  });
});

describe("gen resource --add", () => {
  it("appends columns instead of making you restate the ones you have", async () => {
    const root = await app();
    const descriptor = "resources/contact.resource.ts";

    await genResource("Contact", { ...quiet, cwd: root, add: "phone:phone?, notes:text?" });

    const written = read(root, descriptor);
    // What was there is still there, in its original order...
    expect(written).toContain("name: field.string(),");
    expect(written).toContain('email: field.string({ format: "email" }),');
    // ...and the new ones follow it.
    expect(written).toContain('phone: field.string({ required: false, format: "tel" }),');
    expect(written).toContain("notes: field.text({ required: false }),");
    expect(written.indexOf("name: field")).toBeLessThan(written.indexOf("phone: field"));
  });

  it("regenerates everything downstream, so the column reaches the table and the form", async () => {
    const root = await app();
    await genResource("Contact", { ...quiet, cwd: root, add: "phone:phone?" });
    // The Drizzle table is the proof: the column exists in the database layer, not just
    // in the descriptor. (The validators and the client derive from the descriptor at
    // runtime and never name a field, so there is nothing to assert in them.)
    expect(read(root, "db/schema/contacts.ts")).toContain("phone");
  });

  it("refuses a name that is already taken, rather than writing it twice", async () => {
    const root = await app();
    // Two fields of the same name is a descriptor that will not load; saying so here
    // names the file to edit, which the runtime error would not.
    await expect(genResource("Contact", { ...quiet, cwd: root, add: "email:string" })).rejects.toThrow(/already has a field called "email"/);
  });

  it("refuses --add with --fields, because they mean opposite things", async () => {
    const root = await app();
    await expect(genResource("Contact", { ...quiet, cwd: root, add: "a:string", fields: "b:string" })).rejects.toThrow(/one or the other/);
  });

  it("refuses to add to a resource that does not exist, and says how to make it", async () => {
    const root = await app();
    await expect(genResource("Ghost", { ...quiet, cwd: root, add: "a:string" })).rejects.toThrow(/There is no .* to add to/);
  });
});
