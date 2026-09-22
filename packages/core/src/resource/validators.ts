import { z } from "zod";
import { storedFields, type Resource } from "./define.js";
import type { CreateInput, Field, StoredField, UpdateInput } from "./fields.js";
import { isColor, isCountryCode, isDomain, isPhoneNumber, isSlug, normalizeDomain } from "./formats.js";

/**
 * Zod schemas derived from a descriptor at runtime. Unknown keys are rejected,
 * so clients can't set `id`, timestamps or undeclared columns (no mass assignment).
 * Messages are written for people (they're shown next to form fields and returned by
 * the REST API).
 */
export interface ResourceValidators<Fields extends Record<string, Field>> {
  create: z.ZodType<CreateInput<Fields>>;
  update: z.ZodType<UpdateInput<Fields>>;
}

const DEFAULT_STRING_MAX = 255;
const DEFAULT_TEXT_MAX = 65_535;
const OBJECT_KEY = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).{1,1024}$/;

/** "Required" when the value is missing, otherwise `message`. */
const typeError = (message: string) => (issue: { input: unknown }) =>
  issue.input === undefined || issue.input === null || issue.input === "" ? "Required" : message;

function stringSchema(max: number, min: number | undefined, required: boolean) {
  let s = z.string({ error: typeError("Enter text") });
  if (max) s = s.max(max, `At most ${max} characters`);
  if (min !== undefined) s = s.min(min, min === 1 ? "Required" : `At least ${min} characters`);
  else if (required) s = s.min(1, "Required");
  return s;
}

export function fieldSchema(def: StoredField): z.ZodType {
  switch (def.kind) {
    case "string": {
      let s = z
        .string({ error: typeError("Enter text") })
        .trim()
        .max(def.maxLength ?? DEFAULT_STRING_MAX, `At most ${def.maxLength ?? DEFAULT_STRING_MAX} characters`);
      if (def.minLength !== undefined) s = s.min(def.minLength, `At least ${def.minLength} characters`);
      else if (def.required) s = s.min(1, "Required");
      if (def.pattern) s = s.regex(new RegExp(def.pattern), "Invalid format");
      switch (def.format) {
        case "email":
          return s.pipe(z.email({ error: "Enter a valid email address" }));
        case "url":
          return s.pipe(z.url({ protocol: /^https?$/, error: "Enter a valid URL (http or https)" }));
        case "tel":
          return s.refine((value) => value === "" || isPhoneNumber(value), "Enter a valid phone number, including the country");
        case "domain":
          // Accept a pasted URL and keep just the hostname.
          return s.transform(normalizeDomain).refine((value) => value === "" || isDomain(value), "Enter a domain such as example.com");
        case "country":
          return s
            .transform((value) => value.toUpperCase())
            .refine((value) => value === "" || isCountryCode(value), "Choose a country");
        case "color":
          return s.transform((value) => value.toLowerCase()).refine((value) => value === "" || isColor(value), "Enter a colour such as #f2541d");
        case "slug":
          return s.refine((value) => value === "" || isSlug(value), "Use lowercase letters, numbers and hyphens, e.g. my-first-post");
        default:
          return s;
      }
    }
    case "text":
      return stringSchema(def.maxLength ?? DEFAULT_TEXT_MAX, def.minLength, def.required);
    case "int":
    case "float": {
      let s = z.number({ error: typeError("Enter a number") });
      if (def.kind === "int") s = s.int("Enter a whole number");
      if (def.min !== undefined) s = s.min(def.min, `Must be at least ${def.min}`);
      if (def.max !== undefined) s = s.max(def.max, `Must be at most ${def.max}`);
      return s;
    }
    case "boolean":
      return z.boolean({ error: typeError("Choose yes or no") });
    case "date":
      return z.iso.date({ error: typeError("Enter a valid date") });
    case "datetime":
      return z.iso.datetime({ offset: true, error: typeError("Enter a valid date and time") });
    case "enum":
      return z.enum(def.options as [string, ...string[]], { error: typeError("Choose one of the options") });
    case "multiselect": {
      let s = z
        .array(z.enum(def.options as [string, ...string[]], { error: "Choose from the listed options" }), { error: typeError("Choose one or more options") })
        .refine((values) => new Set(values).size === values.length, "Each option can be picked once");
      const min = def.minItems ?? (def.required ? 1 : 0);
      if (min > 0) s = s.refine((values) => values.length >= min, min === 1 ? "Choose at least one" : `Choose at least ${min}`);
      if (def.maxItems !== undefined) s = s.refine((values) => values.length <= def.maxItems!, `Choose at most ${def.maxItems}`);
      return s;
    }
    case "file":
      return z.string({ error: typeError("Upload a file") }).regex(OBJECT_KEY, "Invalid file");
    case "belongsTo":
      return z.string({ error: typeError("Choose a record") }).min(1, "Required");
  }
}

/**
 * Where a file field's uploads live: `<table>/<field>/`. The admin issues upload URLs
 * under this prefix, and a record only accepts keys under it — otherwise anyone who can
 * edit a record could attach another resource's private file and read it through theirs.
 */
export const fileKeyPrefix = (resource: Pick<Resource, "table">, fieldKey: string) => `${resource.table}/${fieldKey}/`;

export function createValidators<Fields extends Record<string, Field>>(resource: Resource<Fields>): ResourceValidators<Fields> {
  const create: Record<string, z.ZodType> = {};
  const update: Record<string, z.ZodType> = {};

  for (const [key, def] of storedFields(resource as unknown as Resource)) {
    let base = fieldSchema(def);
    if (def.kind === "file") {
      const prefix = fileKeyPrefix(resource as unknown as Resource, key);
      // Malformed keys already fail the format check; report one problem at a time.
      base = base.refine(
        (value) => typeof value !== "string" || !OBJECT_KEY.test(value) || value.startsWith(prefix),
        "This file wasn't uploaded for this field",
      );
    }
    const value = def.required ? base : base.nullable();
    update[key] = value.optional();
    const hasDefault = "default" in def && def.default !== undefined;
    create[key] = def.required && !hasDefault ? value : value.optional();
  }

  const unknownKeys = { error: (issue: { code?: string; keys?: string[] }) => (issue.code === "unrecognized_keys" ? `Unknown field(s): ${issue.keys?.join(", ")}` : undefined) };
  return {
    create: z.strictObject(create, unknownKeys) as unknown as z.ZodType<CreateInput<Fields>>,
    update: z.strictObject(update, unknownKeys) as unknown as z.ZodType<UpdateInput<Fields>>,
  };
}
