import { describe, expect, it } from "vitest";
import { conditionHolds, describeCondition, type FieldCondition } from "../src/resource/conditions.js";
import { createValidators } from "../src/resource/validators.js";
import { defineResource } from "../src/resource/define.js";
import { field } from "../src/resource/fields.js";

/**
 * Fields that only apply sometimes.
 *
 * The rule lives on the field, so the validator and the form read the same object. These
 * watch the validator half: required when it applies, absent and uncomplaining when it
 * does not.
 */
const project = defineResource({
  name: "Project",
  fields: {
    name: field.string(),
    kind: field.enum(["oneOff", "recurring"]),
    billingCycle: field.enum(["monthly", "annually"], {
      showWhen: { field: "kind", op: "eq", value: "recurring" },
    }),
    poNumber: field.string({ required: false, showWhen: { field: "kind", op: "eq", value: "oneOff" } }),
  },
});

const { create, update } = createValidators(project);
const ok = (schema: { safeParse(v: unknown): { success: boolean } }, value: object) => schema.safeParse(value).success;
const errors = (schema: { safeParse(v: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, value: object) =>
  schema.safeParse(value).error?.issues.map((issue) => `${String(issue.path[0])}: ${issue.message}`) ?? [];

describe("deciding whether a field applies", () => {
  const eq: FieldCondition = { field: "kind", op: "eq", value: "recurring" };

  it("compares the controlling field", () => {
    expect(conditionHolds(eq, { kind: "recurring" })).toBe(true);
    expect(conditionHolds(eq, { kind: "oneOff" })).toBe(false);
  });

  it("treats a missing controlling value as not matching", () => {
    expect(conditionHolds(eq, {})).toBe(false);
    expect(conditionHolds(eq, { kind: null })).toBe(false);
  });

  it("compares as text, because a form sends everything as a string", () => {
    // The same record, once from the API and once from a form. Both must answer alike.
    const active: FieldCondition = { field: "active", op: "eq", value: "true" };
    expect(conditionHolds(active, { active: true })).toBe(true);
    expect(conditionHolds(active, { active: "true" })).toBe(true);
    expect(conditionHolds(active, { active: false })).toBe(false);
  });

  it("handles != and in", () => {
    expect(conditionHolds({ field: "kind", op: "ne", value: "oneOff" }, { kind: "recurring" })).toBe(true);
    expect(conditionHolds({ field: "kind", op: "ne", value: "oneOff" }, { kind: "oneOff" })).toBe(false);
    const list: FieldCondition = { field: "kind", op: "in", value: ["recurring", "retainer"] };
    expect(conditionHolds(list, { kind: "retainer" })).toBe(true);
    expect(conditionHolds(list, { kind: "oneOff" })).toBe(false);
  });

  it("says a field with no condition always applies", () => {
    expect(conditionHolds(undefined, {})).toBe(true);
  });

  it("describes itself for a message", () => {
    expect(describeCondition({ field: "kind", op: "eq", value: "recurring" })).toBe("kind is recurring");
    expect(describeCondition({ field: "kind", op: "in", value: ["a", "b"] })).toBe("kind is one of a, b");
  });
});

describe("creating a record", () => {
  it("requires the field when the condition holds", () => {
    expect(errors(create, { name: "Site", kind: "recurring" })).toEqual(["billingCycle: Required when kind is recurring"]);
  });

  it("accepts it when it is given", () => {
    expect(ok(create, { name: "Site", kind: "recurring", billingCycle: "monthly" })).toBe(true);
  });

  it("does not require it when the condition does not hold", () => {
    // A one-off project has no billing cycle, and saying so is not an error.
    expect(ok(create, { name: "Logo", kind: "oneOff", poNumber: "PO-1" })).toBe(true);
  });

  it("leaves a field that is optional even when it applies", () => {
    // poNumber applies to a one-off, but is declared optional, so absence is fine.
    expect(ok(create, { name: "Logo", kind: "oneOff" })).toBe(true);
  });

  it("still enforces the ordinary required fields", () => {
    expect(errors(create, { kind: "oneOff" })).toContainEqual(expect.stringContaining("name:"));
  });

  it("refuses a value outside the enum even on a conditional field", () => {
    expect(ok(create, { name: "Site", kind: "recurring", billingCycle: "weekly" })).toBe(false);
  });
});

describe("updating a record", () => {
  it("ignores a patch that mentions neither field", () => {
    // Renaming a recurring project must not fail over a cycle the patch never mentioned.
    expect(ok(update, { name: "Renamed" })).toBe(true);
  });

  it("enforces the rule when the patch switches the controlling field", () => {
    expect(errors(update, { kind: "recurring" })).toEqual(["billingCycle: Required when kind is recurring"]);
  });

  it("accepts the switch when the dependent field comes with it", () => {
    expect(ok(update, { kind: "recurring", billingCycle: "annually" })).toBe(true);
  });

  it("refuses to blank the field while it still applies", () => {
    expect(errors(update, { kind: "recurring", billingCycle: null })).toEqual(["billingCycle: Required when kind is recurring"]);
  });
});
