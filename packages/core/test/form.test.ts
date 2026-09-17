import { describe, expect, it } from "vitest";
import { createValidators, defineResource, field, formValuesToInput, initialFormValues, issuesByField } from "../src/resource/index.js";

const contact = defineResource({
  name: "Contact",
  fields: {
    name: field.string(),
    email: field.string({ format: "email" }),
    bio: field.text({ required: false }),
    age: field.int({ required: false, min: 0 }),
    score: field.float({ default: 1.5 }),
    vip: field.boolean({ default: false }),
    status: field.enum(["lead", "customer"], { default: "lead" }),
    birthday: field.date({ required: false }),
    companyId: field.belongsTo("Company", { required: false }),
  },
});
const { create, update } = createValidators(contact);

describe("initialFormValues", () => {
  it("uses descriptor defaults for create", () => {
    expect(initialFormValues(contact)).toEqual({
      name: "", email: "", bio: "", age: "", score: "1.5", vip: false, status: "lead", birthday: "", companyId: "",
    });
  });

  it("uses record values for edit, with empty strings for nulls", () => {
    const values = initialFormValues(contact, { name: "Ada", email: "a@b.co", bio: null, age: 36, score: 2, vip: true, status: "customer", birthday: "1815-12-10", companyId: null });
    expect(values).toMatchObject({ name: "Ada", bio: "", age: "36", score: "2", vip: true, birthday: "1815-12-10", companyId: "" });
  });
});

describe("formValuesToInput", () => {
  it("converts numbers, clears optional fields, and lets defaults apply on create", () => {
    const values = { ...initialFormValues(contact), name: "Ada", email: "ada@example.com", age: " 36 ", score: "", status: "" };
    const input = formValuesToInput(contact, values, "create");
    expect(input).toEqual({ name: "Ada", email: "ada@example.com", bio: null, age: 36, vip: false, birthday: null, companyId: null });
    expect(create.safeParse(input).success).toBe(true);
  });

  it("reports empty required fields and bad numbers with friendly messages", () => {
    const values = { ...initialFormValues(contact), age: "3x" };
    const result = create.safeParse(formValuesToInput(contact, values, "create"));
    expect(result.success).toBe(false);
    expect(issuesByField(result.error!.issues)).toEqual({ name: "Required", email: "Required", age: "Enter a number" });
  });

  it("clears optional values on edit and keeps validation messages readable", () => {
    const values = { ...initialFormValues(contact, { name: "Ada", email: "ada@example.com", age: 36, score: 2, vip: true, status: "customer" }), age: "", email: "nope", status: "" };
    const input = formValuesToInput(contact, values, "edit");
    expect(input).toMatchObject({ age: null, email: "nope" });
    expect(input).not.toHaveProperty("status");
    const result = update.safeParse(input);
    expect(issuesByField(result.error!.issues)).toEqual({ email: "Enter a valid email address" });
  });
});

describe("validator messages", () => {
  it("are written for people", () => {
    const result = create.safeParse({ name: "x".repeat(300), email: "a@b.co", age: -1, status: "vip", birthday: "2026-02-30", extra: 1 });
    expect(issuesByField(result.error!.issues)).toEqual({
      name: "At most 255 characters",
      age: "Must be at least 0",
      status: "Choose one of the options",
      birthday: "Enter a valid date",
      _form: "Unknown field(s): extra",
    });
  });
});
