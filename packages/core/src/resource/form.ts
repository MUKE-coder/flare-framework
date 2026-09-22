import { storedFields, type Resource } from "./define.js";

/**
 * Form state for a resource: strings for text-like inputs, booleans for toggles, and a
 * JSON array string for multiselects.
 * These helpers convert between records, form state, and API input so every admin
 * form handles empty values, numbers, and defaults the same way.
 */
export type FormValues = Record<string, string | boolean>;

/** Initial form state: the record's values (edit) or the descriptor's defaults (create). */
export function initialFormValues(resource: Resource, record?: Record<string, unknown> | null): FormValues {
  const values: FormValues = {};
  for (const [key, def] of storedFields(resource)) {
    const source = record ? record[key] : "default" in def ? def.default : undefined;
    if (def.kind === "boolean") values[key] = source === true || source === 1;
    else if (def.kind === "multiselect") values[key] = JSON.stringify(Array.isArray(source) ? source : []);
    else if (source === null || source === undefined) values[key] = "";
    else if (source instanceof Date) values[key] = source.toISOString();
    else values[key] = String(source);
  }
  return values;
}

/**
 * API input from form state. Empty optional fields become null (clearing them);
 * empty fields that have a default are omitted on create so the default applies;
 * empty required fields are left for validation to report as "Required".
 */
export function formValuesToInput(resource: Resource, values: FormValues, mode: "create" | "edit"): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [key, def] of storedFields(resource)) {
    const raw = values[key];
    if (def.kind === "boolean") {
      input[key] = raw === true;
      continue;
    }
    if (def.kind === "multiselect") {
      const picked = parseMultiValue(raw);
      if (picked.length === 0 && mode === "create" && "default" in def && def.default !== undefined) continue;
      input[key] = picked.length === 0 && !def.required ? null : picked;
      continue;
    }
    const text = typeof raw === "string" ? raw : "";
    const empty = text.trim() === "";
    if (empty) {
      const hasDefault = "default" in def && def.default !== undefined;
      if (mode === "create" && hasDefault) continue;
      if (!def.required) input[key] = null;
      else if (def.kind === "string" || def.kind === "text") input[key] = text;
      // Required non-text fields: omit, so validation reports "Required".
      continue;
    }
    if (def.kind === "int" || def.kind === "float") {
      const number = Number(text.trim());
      input[key] = Number.isFinite(number) ? number : text;
      continue;
    }
    input[key] = text;
  }
  return input;
}

/** A multiselect's form state (a JSON array string) as the picked values. */
export function parseMultiValue(raw: string | boolean | undefined): string[] {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

/** Field errors keyed by field name, from validation or API issues (first message wins). */
export function issuesByField(issues: { path: string | PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = Array.isArray(issue.path) ? issue.path.map(String).join(".") : issue.path;
    const key = path.split(".")[0] || "_form";
    errors[key] ??= issue.message;
  }
  return errors;
}
