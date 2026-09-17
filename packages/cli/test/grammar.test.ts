import { describe, expect, it } from "vitest";
import { parseField, parseFields, splitTopLevel } from "../src/generator/grammar.js";

describe("splitTopLevel", () => {
  it("ignores commas inside parentheses and brackets", () => {
    expect(splitTopLevel("a:string, s:enum(x,y), f:file:[image,pdf]?, ,")).toEqual([
      "a:string",
      "s:enum(x,y)",
      "f:file:[image,pdf]?",
    ]);
  });
});

describe("parseField", () => {
  it("parses simple kinds", () => {
    for (const kind of ["string", "text", "int", "float", "boolean", "date", "datetime"]) {
      expect(parseField(`x:${kind}`)).toEqual({ key: "x", kind, required: true, unique: false });
    }
  });

  it("parses optional and unique suffixes in either order", () => {
    expect(parseField("sku:string!?")).toMatchObject({ required: false, unique: true });
    expect(parseField("sku:string?!")).toMatchObject({ required: false, unique: true });
    expect(parseField("bio:text ?")).toMatchObject({ kind: "text", required: false });
  });

  it("parses enums", () => {
    expect(parseField("status: enum( draft, published ,archived )")).toMatchObject({
      kind: "enum",
      options: ["draft", "published", "archived"],
    });
  });

  it("parses file fields with a MIME category list", () => {
    expect(parseField("avatar:file:[image, PDF]?")).toMatchObject({
      key: "avatar",
      kind: "file",
      accept: ["image", "pdf"],
      required: false,
    });
  });

  it("parses relations and normalizes belongsTo keys", () => {
    expect(parseField("company:belongsTo(Company)?")).toEqual({
      key: "companyId",
      kind: "belongsTo",
      target: "Company",
      required: false,
      unique: false,
    });
    expect(parseField("owner_id:belongsTo(User)")).toMatchObject({ key: "ownerId", target: "User" });
    expect(parseField("notes:hasMany(Note)")).toEqual({ key: "notes", kind: "hasMany", target: "Note", required: false, unique: false });
  });

  it("camelCases field names and infers email/url formats", () => {
    expect(parseField("first_name:string")).toMatchObject({ key: "firstName" });
    expect(parseField("email:string!")).toMatchObject({ format: "email", unique: true });
    expect(parseField("billing_email:string")).toMatchObject({ key: "billingEmail", format: "email" });
    expect(parseField("website:string?")).toMatchObject({ format: "url" });
    expect(parseField("avatarUrl:string")).toMatchObject({ format: "url" });
    expect(parseField("emailed:boolean").format).toBeUndefined();
    expect(parseField("curl:string").format).toBeUndefined();
  });

  it.each([
    ["name", /expected name:type/],
    [":string", /expected name:type/],
    ["1st:string", /must start with a letter/],
    ["name:strng", /unknown type "strng". Did you mean "string"\?/],
    ["due:datetim", /Did you mean "datetime"\?/],
    ["s:enum()", /enum option list is empty/],
    ["s:enum(a b)", /may only use letters/],
    ["s:enum(a,a)", /duplicate enum options/],
    ["f:file", /list accepted types/],
    ["f:file:[imgae]", /unknown file type "imgae". Did you mean "image"\?/],
    ["c:belongsTo(company)", /PascalCase resource name/],
    ["n:hasMany(Note)?", /can't be optional or unique/],
  ])("rejects %s", (spec, message) => {
    expect(() => parseField(spec)).toThrow(message);
  });
});

describe("parseFields", () => {
  it("parses the exit-criteria example", () => {
    expect(parseFields("name:string, email:string")).toEqual([
      { key: "name", kind: "string", required: true, unique: false },
      { key: "email", kind: "string", required: true, unique: false, format: "email" },
    ]);
  });

  it("rejects empty input and duplicate keys (including after normalization)", () => {
    expect(() => parseFields(" , ")).toThrow(/No fields given/);
    expect(() => parseFields("first_name:string, firstName:text")).toThrow(/declared more than once/);
    expect(() => parseFields("company:belongsTo(Company), companyId:string")).toThrow(/declared more than once/);
  });
});
