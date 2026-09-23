import { storedFields, type Resource } from "../resource/define.js";
import type { StoredField } from "../resource/fields.js";

export interface ListQuery {
  page: number;
  perPage: number;
  sort: { field: string; direction: "asc" | "desc" };
  q?: string;
  /** Field key → coerced value; `null` means IS NULL. */
  filters: Record<string, string | number | boolean | null>;
  /**
   * Where to carry on from, instead of counting rows to skip. `OFFSET 500000` makes
   * SQLite walk half a million index entries before it reads anything (8s at a million
   * rows); a cursor turns that into a range scan (~100ms).
   */
  cursor?: Cursor;
}

/** The last row of the page you came from, and which way you're going. */
export interface Cursor {
  /** The sort field's value on that row. */
  value: string | number | boolean | null;
  id: string;
  direction: "after" | "before";
}

/** Cursors travel in the URL, so they're base64url of the smallest JSON that works. */
export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify([cursor.value, cursor.id, cursor.direction === "before" ? 0 : 1]);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCursor(raw: string): Cursor | undefined {
  try {
    const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as [string | number | boolean | null, string, number];
    if (!Array.isArray(parsed) || typeof parsed[1] !== "string") return undefined;
    return { value: parsed[0], id: parsed[1], direction: parsed[2] === 0 ? "before" : "after" };
  } catch {
    return undefined;
  }
}

export interface QueryIssue {
  param: string;
  message: string;
}

const TIMESTAMP_FIELDS = ["createdAt", "updatedAt"];
const MAX_PER_PAGE = 100;
const MAX_SEARCH_LENGTH = 200;

export function isSortable(def: StoredField): boolean {
  return def.sortable ?? !["text", "file"].includes(def.kind);
}

export function isFilterable(def: StoredField): boolean {
  return def.filterable ?? ["enum", "boolean", "belongsTo"].includes(def.kind);
}

export function isSearchable(def: StoredField): boolean {
  return def.searchable ?? def.kind === "string";
}

function coerce(def: StoredField, raw: string): string | number | boolean | null | undefined {
  if (raw === "null") return def.required ? undefined : null;
  switch (def.kind) {
    case "boolean":
      return raw === "true" || raw === "1" ? true : raw === "false" || raw === "0" ? false : undefined;
    case "int":
      return /^-?\d+$/.test(raw) ? Number(raw) : undefined;
    case "float":
      return raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
    case "enum":
      return def.options.includes(raw) ? raw : undefined;
    default:
      return raw;
  }
}

/**
 * Parse `?page=2&perPage=50&sort=-createdAt&q=ada&filter[status]=lead` against a
 * resource. Only fields the descriptor marks sortable/filterable/searchable are
 * accepted, so clients can't probe arbitrary columns.
 */
export function parseListQuery(resource: Resource, params: URLSearchParams): { query: ListQuery } | { issues: QueryIssue[] } {
  const issues: QueryIssue[] = [];
  const fields = new Map(storedFields(resource));

  const positiveInt = (name: string, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
    const raw = params.get(name);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || value < 1 || value > max) {
      issues.push({ param: name, message: `must be an integer from 1 to ${max === Number.MAX_SAFE_INTEGER ? "∞" : max}` });
      return fallback;
    }
    return value;
  };

  const page = positiveInt("page", 1);
  const perPage = positiveInt("perPage", resource.perPage, MAX_PER_PAGE);

  let sort = resource.defaultSort;
  const rawSort = params.get("sort");
  if (rawSort) {
    const direction = rawSort.startsWith("-") ? "desc" : "asc";
    const field = rawSort.replace(/^-/, "");
    const def = fields.get(field);
    if (TIMESTAMP_FIELDS.includes(field) || (def && isSortable(def))) sort = { field, direction };
    else issues.push({ param: "sort", message: `can't sort by "${field}"` });
  }

  const q = params.get("q")?.trim().slice(0, MAX_SEARCH_LENGTH) || undefined;

  const rawCursor = params.get("cursor");
  let cursor: Cursor | undefined;
  if (rawCursor) {
    cursor = decodeCursor(rawCursor);
    if (!cursor) issues.push({ param: "cursor", message: "isn't a cursor this list handed out" });
  }

  const filters: ListQuery["filters"] = {};
  for (const [name, raw] of params) {
    const match = /^filter\[(.+)\]$/.exec(name);
    if (!match) continue;
    const key = match[1]!;
    const def = fields.get(key);
    if (!def || !isFilterable(def)) {
      issues.push({ param: name, message: `can't filter by "${key}"` });
      continue;
    }
    const value = coerce(def, raw);
    if (value === undefined) issues.push({ param: name, message: `invalid value "${raw}"` });
    else filters[key] = value;
  }

  return issues.length ? { issues } : { query: { page, perPage, sort, q, filters, cursor } };
}
