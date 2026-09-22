import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineResource, field } from "@flaredev/core";
import { afterEach, describe, expect, it } from "vitest";
import { renderSeed, seedFiles } from "../src/commands/seed.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("seedFiles", () => {
  it("lists seeds in file-name order and resolves names", () => {
    const root = mkdtempSync(join(tmpdir(), "flare-seed-"));
    dirs.push(root);
    mkdirSync(join(root, "seeds"));
    for (const file of ["b.seed.ts", "a.seed.ts", "notes.md"]) writeFileSync(join(root, "seeds", file), "");
    expect(seedFiles(root)).toEqual(["a.seed.ts", "b.seed.ts"]);
    expect(seedFiles(root, ["b", "a.seed.ts"])).toEqual(["b.seed.ts", "a.seed.ts"]);
    expect(() => seedFiles(root, ["c"])).toThrow('No seed "c" in seeds/. Available: a, b.');
  });

  it("returns nothing when there is no seeds folder", () => {
    const root = mkdtempSync(join(tmpdir(), "flare-seed-"));
    dirs.push(root);
    expect(seedFiles(root)).toEqual([]);
  });
});

describe("renderSeed", () => {
  it("renders example rows per field kind, with TODOs for required relations", () => {
    const deal = defineResource({
      name: "Deal",
      fields: {
        title: field.string(),
        contactEmail: field.string({ format: "email" }),
        site: field.string({ format: "url", required: false }),
        notes: field.text({ required: false }),
        qty: field.int(),
        price: field.float(),
        won: field.boolean(),
        closeOn: field.date(),
        seenAt: field.datetime({ required: false }),
        stage: field.enum(["open", "won"]),
        contract: field.file(["pdf"], { required: false }),
        companyId: field.belongsTo("Company"),
        ownerId: field.belongsTo("Contact", { required: false }),
      },
    });
    const source = renderSeed(deal);
    expect(source).toContain('import { deals } from "@/db/schema";');
    for (const line of [
      "    title: fake.words(2),",
      "    contactEmail: fake.email(),",
      "    site: fake.url(),",
      "    notes: fake.paragraph(),",
      "    qty: fake.int(1, 1000),",
      "    price: fake.float(1, 1000),",
      "    won: fake.bool(),",
      "    closeOn: fake.date(),",
      "    seenAt: fake.datetime(),",
      '    stage: fake.pick(["open","won"]),',
      "    // companyId: TODO (id of an existing Company),",
      "await insertMany(deals, COUNT,",
    ]) {
      expect(source).toContain(line);
    }
    expect(source).not.toContain("contract");
    expect(source).not.toContain("ownerId");
  });

  it("renders a blank seed without a resource", () => {
    expect(renderSeed(undefined)).toContain('log("nothing to seed yet");');
  });
});
