import { createValidators, defineResource, field, formValuesToInput, initialFormValues, formatValue } from "@flaredev/core";
import { describe, expect, it } from "vitest";
import { parseField } from "../src/generator/grammar.js";
import { renderField } from "../src/generator/descriptor.js";
import { renderTableModule } from "../src/generator/render.js";
import { renderPrismaModel } from "../src/generator/prisma.js";
import type { LoadedResource } from "../src/generator/load.js";

/**
 * `markdown`, `tags` and `json`.
 *
 * Three things the other kinds could not hold: long text with a preview, a free list of
 * labels, and a value whose shape is deliberately not declared.
 */
const note = defineResource({
  name: "Note",
  fields: {
    title: field.string(),
    body: field.markdown(),
    labels: field.tags({ required: false }),
    settings: field.json({ required: false }),
  },
});
const loaded: LoadedResource = { resource: note, stem: "note", file: "resources/note.resource.ts" };

describe("the grammar", () => {
  it("takes markdown and richtext as the same thing", () => {
    for (const word of ["markdown", "richtext"]) {
      const parsed = parseField(`body:${word}`);
      expect(parsed.kind, word).toBe("text");
      expect(parsed.textFormat, word).toBe("markdown");
    }
  });

  it("takes tags and json as kinds of their own", () => {
    expect(parseField("labels:tags?").kind).toBe("tags");
    expect(parseField("labels:tags?").required).toBe(false);
    expect(parseField("settings:json").kind).toBe("json");
  });

  it("writes a markdown field as field.markdown(), not field.text({ format })", () => {
    // The descriptor is read far more often than it is generated.
    expect(renderField(parseField("body:markdown"))).toBe("body: field.markdown(),");
    expect(renderField(parseField("notes:text"))).toBe("notes: field.text(),");
    expect(renderField(parseField("labels:tags?"))).toBe("labels: field.tags({ required: false }),");
  });
});

describe("the columns", () => {
  it("stores tags and json as JSON on Drizzle, and markdown as text", () => {
    const table = renderTableModule(loaded, [loaded]);
    expect(table).toContain('body: text("body").notNull()');
    expect(table).toContain('labels: text("labels", { mode: "json" }).$type<string[]>()');
    expect(table).toContain('settings: text("settings", { mode: "json" })');
  });

  it("stores them as a list and jsonb on Prisma", () => {
    const models = renderPrismaModel(loaded, [loaded]);
    // A Prisma list is never nullable — an empty list is the empty state — so no `?`.
    expect(models).toMatch(/labels\s+String\[\]/);
    expect(models).not.toMatch(/labels\s+String\[\]\?/);
    // Json, not String: queryable, indexable, and handed back parsed.
    expect(models).toMatch(/settings\s+Json\?/);
    expect(models).toMatch(/body\s+String/);
  });
});

describe("validation", () => {
  const validators = createValidators(note);
  const create = (input: object) => validators.create.safeParse({ title: "t", body: "b", ...input });

  it("takes any JSON value, including a scalar and null", () => {
    for (const value of [{ a: 1 }, [1, 2], "text", 42, true, null]) {
      expect(create({ settings: value }).success, JSON.stringify(value)).toBe(true);
    }
  });

  it("refuses a value that is not JSON at all", () => {
    // What a form hands over when its textarea does not parse.
    expect(create({ settings: Number.NaN }).success).toBe(false);
  });

  it("insists on an object when the field says so", () => {
    const strict = createValidators(defineResource({ name: "Setting", fields: { blob: field.json({ object: true }) } }));
    expect(strict.create.safeParse({ blob: { a: 1 } }).success).toBe(true);
    expect(strict.create.safeParse({ blob: [1] }).success).toBe(false);
    expect(strict.create.safeParse({ blob: "text" }).success).toBe(false);
  });

  it("takes any tag, which is the difference from a multiselect", () => {
    expect(create({ labels: ["anything at all", "q3"] }).success).toBe(true);
  });

  it("refuses the same tag twice, whatever the case", () => {
    // "Urgent" and "urgent" as two tags is a mistake every time.
    expect(create({ labels: ["Urgent", "urgent"] }).success).toBe(false);
  });

  it("refuses a blank tag and one that is too long", () => {
    expect(create({ labels: ["  "] }).success).toBe(false);
    expect(create({ labels: ["x".repeat(33)] }).success).toBe(false);
    expect(create({ labels: ["x".repeat(32)] }).success).toBe(true);
  });

  it("honours minItems and maxItems", () => {
    const bounded = createValidators(defineResource({ name: "Post", fields: { tags: field.tags({ minItems: 2, maxItems: 3 }) } }));
    expect(bounded.create.safeParse({ tags: ["a"] }).success).toBe(false);
    expect(bounded.create.safeParse({ tags: ["a", "b"] }).success).toBe(true);
    expect(bounded.create.safeParse({ tags: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});

describe("form state", () => {
  it("holds tags as a JSON array and json as the text being edited", () => {
    const values = initialFormValues(note, { title: "t", body: "# h", labels: ["a", "b"], settings: { x: 1 } });
    expect(values.labels).toBe('["a","b"]');
    // Indented, because this is what somebody is about to edit by hand.
    expect(values.settings).toBe('{\n  "x": 1\n}');
  });

  it("parses the json text on the way out", () => {
    const input = formValuesToInput(note, { title: "t", body: "b", labels: "[]", settings: '{"x":1}' }, "create");
    expect(input.settings).toEqual({ x: 1 });
  });

  it("turns unparseable json into something validation refuses", () => {
    // Not the raw text: a string *is* valid JSON, so it would save silently and be wrong.
    const input = formValuesToInput(note, { title: "t", body: "b", labels: "[]", settings: "{ oops" }, "create");
    expect(Number.isNaN(input.settings)).toBe(true);
    expect(createValidators(note).create.safeParse(input).success).toBe(false);
  });

  it("clears an empty optional json field rather than storing a blank string", () => {
    const input = formValuesToInput(note, { title: "t", body: "b", labels: "[]", settings: "   " }, "create");
    expect(input.settings).toBeNull();
  });
});

describe("how the values are shown", () => {
  it("joins tags, and keeps a json cell to one line", () => {
    expect(formatValue(note.fields.labels, ["a", "b"])).toBe("a, b");
    expect(formatValue(note.fields.labels, [])).toBe("—");
    const long = { note: "x".repeat(200) };
    const shown = formatValue(note.fields.settings, long);
    expect(shown.length).toBeLessThanOrEqual(60);
    expect(shown.endsWith("…")).toBe(true);
  });
});
