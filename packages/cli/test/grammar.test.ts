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

describe("file size limits", () => {
  it("takes a limit written the way a person says it", () => {
    expect(parseField("doc:file:[pdf]:5mb")).toMatchObject({ key: "doc", kind: "file", accept: ["pdf"], maxBytes: 5 * 1024 * 1024 });
    expect(parseField("doc:file:[any]:512kb")).toMatchObject({ maxBytes: 512 * 1024 });
    expect(parseField("doc:file:[any]:100MB")).toMatchObject({ maxBytes: 100 * 1024 * 1024 });
  });

  it("still parses a file field with no limit, and keeps the suffixes working", () => {
    expect(parseField("doc:file:[pdf]")).toMatchObject({ accept: ["pdf"] });
    expect(parseField("doc:file:[pdf]:5mb")).toMatchObject({ required: true });
    expect(parseField("doc:file:[pdf]:5mb?")).toMatchObject({ required: false, maxBytes: 5 * 1024 * 1024 });
  });

  it("refuses a size it can't read, and one bigger than a request can carry", () => {
    expect(() => parseField("doc:file:[pdf]:huge")).toThrow(/isn't a size/);
    expect(() => parseField("doc:file:[pdf]:2gb")).toThrow(/the most is 100mb/);
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

describe("formats and choices", () => {
  it("parses string formats, the phone alias, select, radio and multiselect", () => {
    const fields = parseFields("phone:tel?, mobile:phone, site:domain, from:country, brand:color, handle:slug!, tier:radio(a,b), kind:select(x,y), tags:multiselect(p,q)?");
    expect(fields.map((f) => [f.key, f.kind, f.format ?? f.widget ?? ""])).toEqual([
      ["phone", "string", "tel"],
      ["mobile", "string", "tel"],
      ["site", "string", "domain"],
      ["from", "string", "country"],
      ["brand", "string", "color"],
      ["handle", "string", "slug"],
      ["tier", "enum", "radio"],
      ["kind", "enum", ""],
      ["tags", "multiselect", ""],
    ]);
  });

  it("refuses a unique multiselect and suggests near-miss types", () => {
    expect(() => parseFields("tags:multiselect(a,b)!")).toThrow(/can't be unique/);
    expect(() => parseFields("site:domian")).toThrow(/Did you mean "domain"/);
  });
});

/**
 * Fields that only apply sometimes.
 *
 * `billingCycle:enum(monthly,annually) if kind == recurring` puts the rule in the
 * declaration, where the validator, the store and the form all read the same object.
 */
describe("conditional fields", () => {
  const parse = (spec: string) => parseFields(`kind:enum(oneOff,recurring), ${spec}`)[1]!;

  it("reads a trailing if", () => {
    expect(parse("billingCycle:enum(monthly,annually) if kind == recurring").showWhen).toEqual({
      field: "kind",
      op: "eq",
      value: "recurring",
    });
  });

  it("still reads the type and its suffixes", () => {
    const field = parse("poNumber:string? if kind == oneOff");
    expect(field.kind).toBe("string");
    expect(field.required).toBe(false);
    expect(field.showWhen).toEqual({ field: "kind", op: "eq", value: "oneOff" });
  });

  it("handles != and in", () => {
    expect(parse("note:string if kind != recurring").showWhen).toEqual({ field: "kind", op: "ne", value: "recurring" });
    expect(parse("cycle:string if kind in (oneOff, recurring)").showWhen).toEqual({
      field: "kind",
      op: "in",
      value: ["oneOff", "recurring"],
    });
  });

  it("does not let a comma in an `in` list split the field", () => {
    const fields = parseFields("kind:enum(a,b), cycle:string if kind in (a, b), note:string");
    expect(fields.map((field) => field.key)).toEqual(["kind", "cycle", "note"]);
  });

  it("refuses a condition on a field that isn't there", () => {
    expect(() => parseFields("kind:enum(a,b), cycle:string if knid == a")).toThrow(/isn't a field here/);
  });

  it("suggests the field they meant", () => {
    expect(() => parseFields("kind:enum(a,b), cycle:string if knid == a")).toThrow(/Did you mean "kind"/);
  });

  it("refuses a value the controlling enum can't produce", () => {
    expect(() => parseFields("kind:enum(oneOff,recurring), cycle:string if kind == recuring")).toThrow(/isn't one of its options/);
  });

  it("refuses a field that depends on itself", () => {
    expect(() => parseFields("kind:enum(a,b), cycle:string if cycle == a")).toThrow(/cannot depend on itself/);
  });

  it("refuses a chain, because the form would have to guess what a hidden parent means", () => {
    expect(() => parseFields("kind:enum(a,b), cycle:string if kind == a, sub:string if cycle == x")).toThrow(/only go one level deep/);
  });

  it("wants true or false against a boolean", () => {
    expect(() => parseFields("active:boolean, reason:string if active == yes")).toThrow(/true or false/);
    expect(parseFields("active:boolean, reason:string if active == false")[1]!.showWhen).toEqual({
      field: "active",
      op: "eq",
      value: "false",
    });
  });

  it("explains a condition it cannot read", () => {
    expect(() => parseFields("kind:enum(a,b), cycle:string if kind")).toThrow(/isn't a condition/);
  });
});
