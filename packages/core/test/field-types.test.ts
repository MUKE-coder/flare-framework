import { describe, expect, it } from "vitest";
import {
  countries,
  createValidators,
  defineResource,
  field,
  formatValue,
  formValuesToInput,
  initialFormValues,
  normalizeDomain,
  slugify,
  splitPhone,
  toE164,
} from "../src/index.js";

const Vendor = defineResource({
  name: "Vendor",
  fields: {
    name: field.string(),
    phone: field.tel({ required: false }),
    domain: field.domain({ required: false }),
    country: field.country({ required: false }),
    color: field.color({ required: false }),
    handle: field.slug({ required: false }),
    tier: field.radio(["bronze", "silver", "gold"]),
    services: field.multiselect(["design", "build", "hosting"], { required: false, maxItems: 2 }),
  },
});
const { create } = createValidators(Vendor);

describe("string formats", () => {
  it("accept and normalise good values", () => {
    const result = create.parse({
      name: "Acme",
      phone: "+256772123456",
      domain: "HTTPS://Acme.Example.com/pricing",
      country: "ke",
      color: "#1A2B3C",
      handle: "acme-studio",
      tier: "silver",
      services: ["design", "hosting"],
    });
    expect(result).toMatchObject({ domain: "acme.example.com", country: "KE", color: "#1a2b3c", services: ["design", "hosting"] });
  });

  it("refuse bad values with a message per field", () => {
    const result = create.safeParse({
      name: "Acme",
      phone: "+1 123",
      domain: "not a domain",
      country: "XX",
      color: "orange",
      handle: "Not A Slug",
      tier: "platinum",
      services: ["design", "catering"],
    });
    expect(result.success).toBe(false);
    const paths = new Set(result.error!.issues.map((issue) => String(issue.path[0])));
    for (const key of ["phone", "domain", "country", "color", "handle", "tier", "services"]) expect(paths, key).toContain(key);
  });

  it("limit multiselect picks", () => {
    expect(create.safeParse({ name: "A", tier: "gold", services: ["design", "build", "hosting"] }).success).toBe(false);
    expect(create.safeParse({ name: "A", tier: "gold", services: ["design", "design"] }).success).toBe(false);
    expect(create.safeParse({ name: "A", tier: "gold", services: [] }).success).toBe(true);
  });
});

describe("builders", () => {
  it("keep formats on string storage and radio/select on enum storage", () => {
    expect(Vendor.fields.phone).toMatchObject({ kind: "string", format: "tel" });
    expect(Vendor.fields.tier).toMatchObject({ kind: "enum", widget: "radio" });
    expect(field.select(["a", "b"])).toMatchObject({ kind: "enum", widget: "select" });
    expect(Vendor.fields.services).toMatchObject({ kind: "multiselect", sortable: false });
  });

  it("reject a multiselect default outside its options", () => {
    expect(() => defineResource({ name: "X", fields: { tags: field.multiselect(["a"], { default: ["b"] as never }) } })).toThrow(/isn't one of its options/);
  });
});

describe("phone helpers", () => {
  it("build E.164 from a country and a local number", () => {
    expect(toE164("UG", "0772 123456")).toBe("+256772123456");
    expect(toE164("US", "(202) 555-0143")).toBe("+12025550143");
    expect(toE164("UG", "")).toBe("");
  });

  it("split a stored number back into country and national part", () => {
    expect(splitPhone("+256772123456")).toEqual({ country: "UG", national: "772123456" });
    expect(splitPhone("")).toEqual({ country: undefined, national: "" });
  });

  it("format for display", () => {
    expect(formatValue(Vendor.fields.phone, "+256772123456")).toBe("+256 772 123456");
    expect(formatValue(Vendor.fields.country, "KE")).toMatch(/Kenya$/);
    expect(formatValue(Vendor.fields.services, ["design", "hosting"])).toBe("Design, Hosting");
  });
});

describe("other helpers", () => {
  it("normalise domains and slugs", () => {
    expect(normalizeDomain(" https://WWW.Example.com./path?q=1 ")).toBe("www.example.com");
    expect(slugify("Crème Brûlée: 2 ways!")).toBe("creme-brulee-2-ways");
  });

  it("list countries with names, dialling codes and flags", () => {
    const uganda = countries().find((country) => country.code === "UG");
    expect(uganda).toMatchObject({ name: "Uganda", dialCode: "256", flag: "🇺🇬" });
    expect(countries().length).toBeGreaterThan(200);
  });

  it("round-trip a multiselect through form state", () => {
    const values = initialFormValues(Vendor, { services: ["build"] });
    expect(values.services).toBe('["build"]');
    expect(formValuesToInput(Vendor, { ...values, name: "A", tier: "gold", services: "[]" }, "create").services).toBeNull();
    expect(formValuesToInput(Vendor, { ...values, name: "A", tier: "gold" }, "edit").services).toEqual(["build"]);
  });
});
