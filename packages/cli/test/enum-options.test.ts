import { defineResource, field, type Resource } from "@flaredev/core";
import { describe, expect, it } from "vitest";
import { enumMemberCollision, prismaEnumMember } from "@flaredev/core";
import { parseField, parseFields } from "../src/generator/grammar.js";
import type { LoadedResource } from "../src/generator/load.js";
import { renderPrismaEnums } from "../src/generator/prisma.js";
import { renderTableModule } from "../src/generator/render.js";

/** The case from issue #74: a clinic resource whose blood group is spelled like a blood group. */
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const patient = defineResource({ name: "Patient", fields: { name: field.string(), bloodGroup: field.enum(BLOOD_GROUPS) } });
const loadedPatient: LoadedResource = { resource: patient, stem: "patient", file: "resources/patient.resource.ts" };

const options = (spec: string) => parseField(spec).options;

describe("enum options with punctuation in them (#74)", () => {
  it("accepts a blood group through the field grammar", () => {
    expect(options(`bloodGroup:enum(${BLOOD_GROUPS.join(",")})?`)).toEqual(BLOOD_GROUPS);
  });

  it("accepts the other shapes that kept turning up: grades, fractions, N/A, percentages", () => {
    expect(options("grade:enum(A+,A,A-,B+,B,B-,F)")).toEqual(["A+", "A", "A-", "B+", "B", "B-", "F"]);
    expect(options("size:enum(1/2,3/4,1)")).toEqual(["1/2", "3/4", "1"]);
    expect(options("status:enum(ok,N/A)")).toEqual(["ok", "N/A"]);
    expect(options("share:enum(0%,50%,100%)")).toEqual(["0%", "50%", "100%"]);
  });

  it("gives each blood group its own Prisma member, with the real value mapped", () => {
    const block = renderPrismaEnums(patient).join("\n");
    // The whole point: eight options, eight distinct members, and the user still sees "A+".
    const members = [...block.matchAll(/^ {2}(\w+)/gm)].map((m) => m[1]);
    expect(new Set(members).size).toBe(BLOOD_GROUPS.length);
    expect(block).toContain('A_2b @map("A+")');
    expect(block).toContain('A_ @map("A-")');
    expect(block).toContain('AB_2b @map("AB+")');
  });

  it("puts the real values in the Drizzle check constraint", () => {
    const schema = renderTableModule(loadedPatient, [loadedPatient]);
    expect(schema).toContain("'A+'");
    expect(schema).toContain("'AB-'");
  });

  it("still folds - and a space to _, so members already generated keep their names", () => {
    // Changing these would rename in_progress in every schema already out there.
    expect(prismaEnumMember("in-progress")).toBe("in_progress");
    expect(prismaEnumMember("in progress")).toBe("in_progress");
    expect(prismaEnumMember("draft")).toBe("draft");
    expect(prismaEnumMember("2fa")).toBe("v_2fa");
  });

  it("escapes everything else by code point instead of flattening it to _", () => {
    expect(prismaEnumMember("A+")).toBe("A_2b");
    expect(prismaEnumMember("N/A")).toBe("N_2fA");
    expect(prismaEnumMember("50%")).toBe("v_50_25");
    expect(prismaEnumMember("C#")).toBe("C_23");
  });

  it("refuses the characters that would break the generated code", () => {
    // A space is trimmed, so it would collide; the others end the option list or the
    // sql`…` template literal the options are written into.
    for (const spec of ["s:enum(a b)", "s:enum(a`b)", "s:enum(a${b)"]) {
      expect(() => parseField(spec)).toThrow();
    }
  });

  it("names both options when two of them would become the same member", () => {
    // Possible because - and a space both fold to _; better said here than by Prisma.
    expect(() => parseField("s:enum(in-progress,in_progress)")).toThrow(/same Prisma enum member/);
    expect(enumMemberCollision(["A+", "A_2b"])).toEqual({ a: "A+", b: "A_2b", member: "A_2b" });
  });

  it("finds no collision in a set that is fine", () => {
    expect(enumMemberCollision(BLOOD_GROUPS)).toBeUndefined();
    expect(enumMemberCollision(["draft", "published"])).toBeUndefined();
  });

  it("carries the options through a whole --fields string", () => {
    const fields = parseFields(`name:string, bloodGroup:enum(${BLOOD_GROUPS.join(",")})?, grade:enum(A+,B-)`);
    expect(fields.find((f) => f.key === "bloodGroup")?.options).toEqual(BLOOD_GROUPS);
    expect(fields.find((f) => f.key === "grade")?.options).toEqual(["A+", "B-"]);
  });
});
