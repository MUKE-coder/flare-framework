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
