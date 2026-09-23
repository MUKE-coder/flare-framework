/**
 * Sample rows for a resource, from its descriptor: the field's kind and format decide
 * the shape of the value, and the field's name decides what it looks like, so a
 * `city` string reads "Kampala" rather than "City 4".
 */
import { columnName, createFake, storedFields, type Fake, type Resource, type StoredField } from "@flaredev/core";
import type { Row, SqlValue } from "./bulk.js";

/** Ids of existing rows in each parent table, keyed by resource name, for belongsTo fields. */
export type ParentIds = Map<string, string[]>;

export interface RowSourceOptions {
  /** Same seed, same rows. Leave out for a different set each run. */
  seed?: number;
  parentIds?: ParentIds;
  /** Overrides "now" when spreading created_at / updated_at (used by tests). */
  now?: number;
}

const has = (key: string, ...words: string[]) => words.some((word) => key.includes(word));

/** Value for a string field, chosen from its format first and its name second. */
function stringValue(key: string, def: Extract<StoredField, { kind: "string" }>, fake: Fake, resource: Resource, index: number): string {
  switch (def.format) {
    case "email":
      return fake.email();
    case "url":
      return fake.url();
    case "tel":
      return fake.phone();
    case "domain":
      return fake.domain();
    case "country":
      return fake.country();
    case "color":
      return fake.color();
    case "slug":
      return fake.slug();
  }

  const name = key.toLowerCase();
  // An organisation's "name" is a company; a person's is a person.
  const organisation = has(resource.name.toLowerCase(), "company", "vendor", "supplier", "organisation", "organization", "account", "team", "store", "brand");
  let value: string;
  if (has(name, "email")) value = fake.email();
  else if (has(name, "phone", "mobile", "tel", "whatsapp")) value = fake.phone();
  else if (has(name, "firstname", "givenname")) value = fake.firstName();
  else if (has(name, "lastname", "surname", "familyname")) value = fake.lastName();
  else if (has(name, "company", "organisation", "organization", "employer", "vendor", "supplier", "business")) value = fake.company();
  else if (has(name, "city", "town")) value = fake.city();
  else if (has(name, "country")) value = fake.country();
  else if (has(name, "address", "street")) value = `${fake.int(1, 240)} ${fake.words(1)} Street, ${fake.city()}`;
  else if (has(name, "website", "url", "link")) value = fake.url();
  else if (has(name, "slug", "handle", "username")) value = fake.slug();
  else if (has(name, "colour", "color")) value = fake.color();
  else if (has(name, "code", "sku", "reference", "number")) value = `${fake.words(1).slice(0, 3).toUpperCase()}-${String(index + 1).padStart(6, "0")}`;
  else if (has(name, "title", "position", "role", "job")) value = fake.jobTitle();
  else if (has(name, "name")) value = organisation ? fake.company() : fake.fullName();
  else if (has(name, "description", "summary", "note", "bio", "about", "message", "comment")) value = fake.sentence();
  else value = `${fake.words(2)}`.replace(/^./, (letter) => letter.toUpperCase());

  if (def.maxLength && value.length > def.maxLength) value = value.slice(0, def.maxLength);
  if (def.minLength && value.length < def.minLength) value = value.padEnd(def.minLength, "x");
  return value;
}

function numberValue(key: string, def: Extract<StoredField, { kind: "int" | "float" }>, fake: Fake): number {
  const name = key.toLowerCase();
  const money = has(name, "price", "amount", "total", "cost", "fee", "revenue", "salary", "balance");
  let min = def.min;
  let max = def.max;
  if (min === undefined || max === undefined) {
    const [low, high] = money
      ? [5, 5000]
      : has(name, "age")
        ? [18, 78]
        : has(name, "year")
          ? [2015, new Date().getFullYear()]
          : has(name, "quantity", "qty", "stock", "seats", "items")
            ? [1, 250]
            : has(name, "percent", "rate", "score", "discount")
              ? [0, 100]
              : [1, 1000];
    min = min ?? low;
    max = max ?? high;
  }
  return def.kind === "int" ? fake.int(Math.ceil(min), Math.floor(max)) : fake.float(min, max, money ? 2 : 2);
}

/** A field's value, or undefined to leave the column out (its database default applies). */
function fieldValue(key: string, def: StoredField, fake: Fake, resource: Resource, parentIds: ParentIds, index: number): SqlValue {
  const name = key.toLowerCase();
  // Optional fields are sometimes empty, the way real data is.
  if (!def.required && def.kind !== "belongsTo" && fake.bool(0.15)) return null;

  switch (def.kind) {
    case "string":
      return stringValue(key, def, fake, resource, index);
    case "text":
      return fake.paragraph(fake.int(1, 3));
    case "int":
    case "float":
      return numberValue(key, def, fake);
    case "boolean":
      // "active" and friends read better mostly true; everything else is a coin flip.
      return fake.bool(has(name, "active", "enabled", "published", "verified", "visible") ? 0.85 : 0.4);
    case "date":
      return has(name, "due", "expire", "end", "renew") ? fake.date(-90) : fake.date();
    case "datetime":
      return has(name, "due", "expire", "end", "renew") ? fake.datetime(-90) : fake.datetime();
    case "enum":
      return fake.pick(def.options);
    case "multiselect":
      return fake.some(def.options, Math.max(1, def.minItems ?? 1), def.maxItems ?? def.options.length);
    case "file":
      // There's no object in R2 to point at, so only fill it when the column demands one.
      return def.required ? `seed/${resource.table}/${fake.count}.bin` : null;
    case "belongsTo": {
      const ids = parentIds.get(def.target) ?? [];
      if (ids.length === 0) {
        if (def.required) {
          throw new Error(`${resource.name}.${key} needs a ${def.target} to belong to, and there are none. Seed ${def.target} first.`);
        }
        return null;
      }
      return fake.pick(ids);
    }
  }
}

/**
 * Make a value unique for its row. A unique column that repeats fails the whole batch,
 * so the row number goes in whatever the value looks like: before the @ of an address,
 * after a hyphen in a slug or code, and after a space in anything else.
 */
function uniquify(value: string, row: number): string {
  const at = value.indexOf("@");
  if (at > 0) return `${value.slice(0, at)}.${row}${value.slice(at)}`;
  if (/^[a-z0-9.-]+$/.test(value)) return `${value}-${row}`;
  return `${value} ${row}`;
}

/** Columns a seeded insert writes, in order: id, the resource's own fields, then the timestamps. */
export function seedColumns(resource: Resource): string[] {
  return ["id", ...storedFields(resource).map(([key]) => columnName(key)), "created_at", "updated_at"];
}

/**
 * `count` rows for `resource`, generated one at a time. Uniqueness comes from the
 * generator's own counter, so unique columns (emails, slugs, codes) stay unique
 * however many rows are asked for.
 */
export function* seedRows(resource: Resource, count: number, options: RowSourceOptions = {}): Generator<Row> {
  const fake = createFake(options.seed ?? Math.floor(Math.random() * 2 ** 31));
  const parentIds = options.parentIds ?? new Map();
  const fields = storedFields(resource);
  const now = options.now ?? Date.now();

  for (let i = 0; i < count; i++) {
    const row: Row = { id: fake.id() };
    for (const [key, def] of fields) {
      let value = fieldValue(key, def, fake, resource, parentIds, i);
      if (typeof value === "string" && "unique" in def && def.unique) value = uniquify(value, i + 1);
      row[columnName(key)] = value;
    }
    // Spread over the past year so lists, charts and "newest first" look real.
    const created = now - fake.int(0, 365) * 86_400_000 - fake.int(0, 86_399_999);
    row.created_at = created;
    row.updated_at = created + fake.int(0, Math.min(now - created, 30 * 86_400_000));
    yield row;
  }
}
