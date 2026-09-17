import { camelCase, FILE_CATEGORIES, type FileCategory } from "@flare/core";

/**
 * The `--fields` grammar of `flare gen resource`:
 *
 *   name:string, email:string!, bio:text?, age:int?, price:float, active:boolean,
 *   birthday:date?, publishedAt:datetime?, status:enum(draft,published),
 *   avatar:file:[image,pdf]?, company:belongsTo(Company)?, notes:hasMany(Note)
 *
 * Suffix `?` = optional (nullable), `!` = unique (combinable: `sku:string!?`).
 * Commas inside (...) and [...] don't split fields.
 */

export type ParsedKind =
  | "string"
  | "text"
  | "int"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "enum"
  | "file"
  | "belongsTo"
  | "hasMany";

export interface ParsedField {
  key: string;
  kind: ParsedKind;
  required: boolean;
  unique: boolean;
  /** enum values */
  options?: string[];
  /** file categories */
  accept?: FileCategory[];
  /** relation target (PascalCase resource name) */
  target?: string;
  format?: "email" | "url";
}

const SIMPLE_KINDS = ["string", "text", "int", "float", "boolean", "date", "datetime"] as const;
const ALL_KINDS = [...SIMPLE_KINDS, "enum", "file", "belongsTo", "hasMany"];

export class FieldGrammarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldGrammarError";
  }
}

/** Split on commas that aren't nested in () or []. */
export function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1]!.toLowerCase() === b[j - 1]!.toLowerCase() ? 0 : 1),
      );
    }
  }
  return dp[a.length]![b.length]!;
}

function suggest(value: string, candidates: readonly string[]): string {
  const best = candidates
    .map((candidate) => ({ candidate, distance: editDistance(value, candidate) }))
    .sort((x, y) => x.distance - y.distance)[0];
  return best && best.distance <= 2 ? ` Did you mean "${best.candidate}"?` : "";
}

function list(raw: string, what: string, spec: string): string[] {
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) throw new FieldGrammarError(`"${spec}": ${what} list is empty.`);
  return items;
}

const RESOURCE_NAME = /^[A-Z][A-Za-z0-9]*$/;

export function parseField(spec: string): ParsedField {
  const colon = spec.indexOf(":");
  if (colon <= 0) throw new FieldGrammarError(`"${spec}": expected name:type, e.g. "title:string".`);

  const rawName = spec.slice(0, colon).trim();
  let type = spec.slice(colon + 1).trim();

  let required = true;
  let unique = false;
  while (/[?!]$/.test(type)) {
    if (type.endsWith("?")) required = false;
    else unique = true;
    type = type.slice(0, -1).trimEnd();
  }

  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(rawName)) {
    throw new FieldGrammarError(`"${spec}": field name "${rawName}" must start with a letter and use letters, digits, or _.`);
  }
  let key = camelCase(rawName);
  const field: ParsedField = { key, kind: "string", required, unique };

  let match: RegExpExecArray | null;
  if ((SIMPLE_KINDS as readonly string[]).includes(type)) {
    field.kind = type as ParsedKind;
  } else if ((match = /^enum\((.*)\)$/.exec(type))) {
    field.kind = "enum";
    const options = list(match[1]!, "enum option", spec);
    for (const option of options) {
      if (!/^[A-Za-z0-9_-]+$/.test(option)) {
        throw new FieldGrammarError(`"${spec}": enum option "${option}" may only use letters, digits, _ and -.`);
      }
    }
    if (new Set(options).size !== options.length) throw new FieldGrammarError(`"${spec}": duplicate enum options.`);
    field.options = options;
  } else if ((match = /^file(?::\[(.*)\])?$/.exec(type))) {
    field.kind = "file";
    if (match[1] === undefined) {
      throw new FieldGrammarError(`"${spec}": file fields list accepted types, e.g. "file:[image,pdf]".`);
    }
    const categories = Object.keys(FILE_CATEGORIES);
    const accept = list(match[1], "file type", spec).map((category) => category.toLowerCase());
    for (const category of accept) {
      if (!categories.includes(category)) {
        throw new FieldGrammarError(
          `"${spec}": unknown file type "${category}".${suggest(category, categories)} Supported: ${categories.join(", ")}.`,
        );
      }
    }
    field.accept = [...new Set(accept)] as FileCategory[];
  } else if ((match = /^(belongsTo|hasMany)\((.*)\)$/i.exec(type))) {
    const kind = match[1]!.toLowerCase() === "belongsto" ? "belongsTo" : "hasMany";
    const target = match[2]!.trim();
    if (!RESOURCE_NAME.test(target)) {
      throw new FieldGrammarError(`"${spec}": relation target "${target}" must be a PascalCase resource name, e.g. "Company".`);
    }
    field.kind = kind;
    field.target = target;
    if (kind === "belongsTo" && !key.endsWith("Id")) key = `${key}Id`;
    if (kind === "hasMany") {
      if (!required || unique) throw new FieldGrammarError(`"${spec}": hasMany fields can't be optional or unique.`);
      field.required = false;
    }
    field.key = key;
  } else {
    const base = type.replace(/[([].*$/, "").replace(/:$/, "");
    throw new FieldGrammarError(`"${spec}": unknown type "${type}".${suggest(base, ALL_KINDS)} Types: ${ALL_KINDS.join(", ")}.`);
  }

  if (field.kind === "string") {
    // Whole word at a camelCase boundary: "email", "billingEmail", "avatarUrl" — not "curl".
    if (/^email$|Email$/.test(key)) field.format = "email";
    else if (/^(url|website)$|(Url|Website)$/.test(key)) field.format = "url";
  }
  return field;
}

export function parseFields(input: string): ParsedField[] {
  const specs = splitTopLevel(input);
  if (specs.length === 0) throw new FieldGrammarError('No fields given. Example: --fields "name:string, email:string"');
  const fields = specs.map(parseField);
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.key)) throw new FieldGrammarError(`Field "${field.key}" is declared more than once.`);
    seen.add(field.key);
  }
  return fields;
}
