import { defineResource, field as builders, kebabCase, pascalCase, type Field } from "@flaredev/core";
import type { ParsedField } from "./grammar.js";
import { hashBlock, joinMarkers } from "./markers.js";

/** Resource names given on the command line ("contact", "order_item") → "Contact", "OrderItem". */
export function resourceName(input: string): string {
  const name = pascalCase(input);
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) throw new Error(`Invalid resource name "${input}". Use letters and digits, e.g. "Contact".`);
  return name;
}

/** `resources/<kebab-singular>.resource.ts` */
export const descriptorPath = (name: string) => `resources/${kebabCase(name)}.resource.ts`;

/** Builder options that differ from the builder defaults. */
function options(field: ParsedField): Record<string, unknown> {
  const opts: Record<string, unknown> = {};
  if (field.kind === "hasMany") return opts;
  if (!field.required) opts.required = false;
  if (field.unique) opts.unique = true;
  if (field.format) opts.format = field.format;
  if (field.widget) opts.widget = field.widget;
  if (field.kind === "belongsTo" && !field.required) opts.onDelete = "set null";
  return opts;
}

/** The descriptor field object the rendered source evaluates to (used to validate before writing). */
export function toField(field: ParsedField): Field {
  const opts = options(field);
  switch (field.kind) {
    case "enum":
      return builders.enum(field.options as [string, ...string[]], opts);
    case "multiselect":
      return builders.multiselect(field.options as [string, ...string[]], opts);
    case "file":
      return builders.file(field.accept!, opts);
    case "belongsTo":
      return builders.belongsTo(field.target!, opts);
    case "hasMany":
      return builders.hasMany(field.target!);
    default:
      return (builders[field.kind] as (o: object) => Field)(opts);
  }
}

const literal = (value: unknown) => JSON.stringify(value);

function renderOptions(opts: Record<string, unknown>): string {
  const entries = Object.entries(opts);
  return entries.length ? `{ ${entries.map(([k, v]) => `${k}: ${literal(v)}`).join(", ")} }` : "";
}

export function renderField(field: ParsedField): string {
  const opts = renderOptions(options(field));
  const args = (...parts: string[]) => parts.filter(Boolean).join(", ");
  switch (field.kind) {
    case "enum":
      return `${field.key}: field.enum(${args(literal(field.options), opts)}),`;
    case "multiselect":
      return `${field.key}: field.multiselect(${args(literal(field.options), opts)}),`;
    case "file":
      return `${field.key}: field.file(${args(literal(field.accept), opts)}),`;
    case "belongsTo":
      return `${field.key}: field.belongsTo(${args(literal(field.target), opts)}),`;
    case "hasMany":
      return `${field.key}: field.hasMany(${literal(field.target)}),`;
    default:
      return `${field.key}: field.${field.kind}(${opts}),`;
  }
}

/** The fields block of a descriptor (unindented), as written between its markers. */
export function renderFieldsBlock(fields: ParsedField[]): string {
  return fields.map((f) => `${renderField(f)}\n`).join("");
}

/**
 * Descriptor source for a new resource. Throws the same errors `defineResource`
 * would at runtime, so an invalid descriptor is never written. The fields block is
 * tracked, so re-running `gen resource --fields` can tell whether it was edited by hand.
 */
export function renderDescriptor(name: string, fields: ParsedField[], options: { group?: string; icon?: string } = {}): string {
  defineResource({ name, fields: Object.fromEntries(fields.map((f) => [f.key, toField(f)])) });
  const block = renderFieldsBlock(fields);
  // Both show up in the sidebar: the icon on the item, the group as its heading.
  const heading = [
    options.icon ? `  icon: ${literal(options.icon)},
` : "",
    options.group ? `  group: ${literal(options.group)},
` : "",
  ].join("");

  return joinMarkers({
    before: `import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: ${literal(name)},
${heading}  fields: {
`,
    block,
    after: `  },
});
`,
    indent: "    ",
    hash: hashBlock(block),
  });
}
