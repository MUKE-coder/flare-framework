import { z } from "zod";
import { storedFields, type Resource } from "./define.js";
import type { CreateInput, Field, StoredField, UpdateInput } from "./fields.js";

/**
 * Zod schemas derived from a descriptor at runtime. Unknown keys are rejected,
 * so clients can't set `id`, timestamps or undeclared columns (no mass assignment).
 */
export interface ResourceValidators<Fields extends Record<string, Field>> {
  create: z.ZodType<CreateInput<Fields>>;
  update: z.ZodType<UpdateInput<Fields>>;
}

const DEFAULT_STRING_MAX = 255;
const DEFAULT_TEXT_MAX = 65_535;
const OBJECT_KEY = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).{1,1024}$/;

export function fieldSchema(def: StoredField): z.ZodType {
  switch (def.kind) {
    case "string": {
      let s = z.string().trim().max(def.maxLength ?? DEFAULT_STRING_MAX);
      if (def.minLength !== undefined) s = s.min(def.minLength);
      else if (def.required) s = s.min(1, "Required");
      if (def.pattern) s = s.regex(new RegExp(def.pattern));
      if (def.format === "email") return s.pipe(z.email());
      if (def.format === "url") return s.pipe(z.url({ protocol: /^https?$/ }));
      return s;
    }
    case "text": {
      let s = z.string().max(def.maxLength ?? DEFAULT_TEXT_MAX);
      if (def.minLength !== undefined) s = s.min(def.minLength);
      else if (def.required) s = s.min(1, "Required");
      return s;
    }
    case "int":
    case "float": {
      let s = def.kind === "int" ? z.number().int() : z.number();
      if (def.min !== undefined) s = s.min(def.min);
      if (def.max !== undefined) s = s.max(def.max);
      return s;
    }
    case "boolean":
      return z.boolean();
    case "date":
      return z.iso.date();
    case "datetime":
      return z.iso.datetime({ offset: true });
    case "enum":
      return z.enum(def.options as [string, ...string[]]);
    case "file":
      return z.string().regex(OBJECT_KEY, "Invalid file key");
    case "belongsTo":
      return z.string().min(1, "Required");
  }
}

export function createValidators<Fields extends Record<string, Field>>(resource: Resource<Fields>): ResourceValidators<Fields> {
  const create: Record<string, z.ZodType> = {};
  const update: Record<string, z.ZodType> = {};

  for (const [key, def] of storedFields(resource as unknown as Resource)) {
    const base = fieldSchema(def);
    const value = def.required ? base : base.nullable();
    update[key] = value.optional();
    const hasDefault = "default" in def && def.default !== undefined;
    create[key] = def.required && !hasDefault ? value : value.optional();
  }

  return {
    create: z.strictObject(create) as unknown as z.ZodType<CreateInput<Fields>>,
    update: z.strictObject(update) as unknown as z.ZodType<UpdateInput<Fields>>,
  };
}
