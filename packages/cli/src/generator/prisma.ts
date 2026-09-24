/**
 * Descriptors → a Prisma schema, for the Next.js stack.
 *
 * The same resource that becomes a Drizzle table and a SQLite migration on Cloudflare
 * becomes a Prisma model and a Postgres table here. Everything above the database — the
 * validators, the policies, the hooks, the dashboard — is shared; this file and its
 * Drizzle counterpart in render.ts are where the two stacks part company.
 *
 * Postgres gives a few things SQLite can't, and they're used rather than emulated: a
 * multiselect is a real `String[]` instead of a JSON blob, and an enum is a real
 * Postgres enum instead of a check constraint.
 */
import { camelCase, columnName, pascalCase, pluralize, storedFields, type Resource, type StoredField } from "@flaredev/core";
import type { LoadedResource } from "./load.js";

const q = (value: unknown) => JSON.stringify(value);

/** `Product` + `kind` → `ProductKind`, the Prisma enum a field of that shape needs. */
export const enumTypeName = (resource: string, key: string) => `${pascalCase(resource)}${pascalCase(key)}`;

/** A Prisma enum value has to be an identifier; "in-progress" can't be one. */
const enumMember = (option: string) => {
  const safe = option.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(?=\d)/, "v_");
  return safe === option ? `  ${safe}` : `  ${safe} @map(${q(option)})`;
};

/** The Prisma scalar (or enum, or relation) type for a field. */
function prismaType(resource: Resource, key: string, def: StoredField): string {
  switch (def.kind) {
    case "int":
      return "Int";
    case "float":
      return "Float";
    case "boolean":
      return "Boolean";
    case "date":
    case "datetime":
      return "DateTime";
    case "enum":
      return enumTypeName(resource.name, key);
    case "multiselect":
      // A Postgres text[]: no JSON to parse, and it can be queried with `has`.
      return "String[]";
    default:
      return "String";
  }
}

/** The `@…` attributes that follow the type. */
function attributes(key: string, def: StoredField): string[] {
  const parts: string[] = [];
  const column = columnName(key);
  if (column !== key) parts.push(`@map(${q(column)})`);
  if ("unique" in def && def.unique) parts.push("@unique");
  if (def.kind === "text") parts.push("@db.Text");
  if (def.kind === "date") parts.push("@db.Date");
  if ("default" in def && def.default !== undefined) {
    const value = def.default;
    if (def.kind === "enum") parts.push(`@default(${String(value).replace(/[^A-Za-z0-9_]/g, "_")})`);
    else if (def.kind === "multiselect") parts.push(`@default([${(value as string[]).map(q).join(", ")}])`);
    else parts.push(`@default(${typeof value === "string" ? q(value) : String(value)})`);
  }
  return parts;
}

/** Prisma's word for what happens to this row when the one it points at goes. */
const onDeleteAction = (onDelete: string | undefined) =>
  onDelete === "set null" ? "SetNull" : onDelete === "cascade" ? "Cascade" : "Restrict";

/** Every enum block a resource needs, in declaration order. */
export function renderPrismaEnums(resource: Resource): string[] {
  return storedFields(resource)
    .filter(([, def]) => def.kind === "enum")
    .map(([key, def]) => {
      if (def.kind !== "enum") return "";
      return [`enum ${enumTypeName(resource.name, key)} {`, ...def.options.map(enumMember), "}"].join("\n");
    })
    .filter(Boolean);
}

/** One side of a relation that Prisma insists on having, whether or not it was declared. */
interface BackReference {
  /** The field added to the *target* model, e.g. `products` on Category. */
  field: string;
  /** The model doing the pointing, e.g. Product. */
  from: string;
  /** Set when one model points at another more than once, so Prisma can tell them apart. */
  relationName?: string;
}

/**
 * The list fields a model needs because something points at it.
 *
 * Drizzle is content with a `belongsTo` on its own — the foreign key is the whole
 * relation. Prisma refuses a schema where one side is missing, so every belongsTo
 * anywhere produces a list field on the model it points at, declared or not. A
 * `hasMany` in the descriptor just names that field; without one it is the plural of
 * the model doing the pointing.
 */
export function backReferences(target: Resource, all: LoadedResource[]): BackReference[] {
  const found: BackReference[] = [];
  for (const { resource: source } of all) {
    const pointing = storedFields(source).filter(([, def]) => def.kind === "belongsTo" && def.target === target.name);
    // Two fields pointing at the same model (an order's customer and its recipient, say)
    // can't share one back-reference; Prisma needs each pair named.
    const ambiguous = pointing.length > 1;
    for (const [key, def] of pointing) {
      if (def.kind !== "belongsTo") continue;
      const declared = Object.entries(target.fields).find(([, other]) => other.kind === "hasMany" && other.target === source.name)?.[0];
      const base = ambiguous ? camelCase(`${key.replace(/Id$/, "")} ${pluralize(source.name)}`) : (declared ?? camelCase(pluralize(source.name)));
      found.push({ field: base, from: source.name, relationName: ambiguous ? `${source.name}_${key}` : undefined });
    }
  }
  return found;
}

/**
 * One `model` block.
 *
 * `all` is needed for two reasons: a belongsTo has to name a model that exists, and a
 * hasMany is only a back-reference — the column lives on the other side.
 */
export function renderPrismaModel(entry: LoadedResource, all: LoadedResource[]): string {
  const resource = entry.resource;
  const byName = new Map(all.map((item) => [item.resource.name, item.resource]));
  const lines: string[] = [`model ${resource.name} {`, `  id String @id @default(uuid())`];
  const indexes: string[] = [];

  for (const [key, def] of Object.entries(resource.fields)) {
    if (def.kind === "hasMany") {
      // Emitted below with the rest of the back-references, so a declared hasMany and an
      // undeclared one come out the same way and can't be written twice.
      if (!byName.get(def.target)) {
        throw new Error(`${resource.name}.${key} has many "${def.target}", but there is no ${def.target} resource. Generate it first.`);
      }
      continue;
    }

    if (def.kind === "belongsTo") {
      const target = byName.get(def.target);
      if (!target) throw new Error(`${resource.name}.${key} belongs to "${def.target}", but there is no ${def.target} resource. Generate it first.`);
      const optional = def.required ? "" : "?";
      const relationField = key.replace(/Id$/, "");
      const named = backReferences(target, all).find((back) => back.from === resource.name && back.relationName?.endsWith(`_${key}`));
      const relationArgs = [
        ...(named?.relationName ? [q(named.relationName)] : []),
        `fields: [${key}]`,
        "references: [id]",
        `onDelete: ${onDeleteAction(def.onDelete)}`,
      ];
      lines.push(`  ${key} String${optional} @map(${q(columnName(key))})`);
      lines.push(`  ${relationField} ${target.name}${optional} @relation(${relationArgs.join(", ")})`);
      indexes.push(`  @@index([${key}])`);
      continue;
    }

    const optional = def.required || def.kind === "multiselect" ? "" : "?";
    lines.push(`  ${key} ${prismaType(resource, key, def)}${optional} ${attributes(key, def).join(" ")}`.trimEnd());
  }

  for (const back of backReferences(resource, all)) {
    const args = back.relationName ? `@relation(${q(back.relationName)})` : "";
    lines.push(`  ${back.field} ${back.from}[] ${args}`.trimEnd());
  }

  lines.push(`  createdAt DateTime @default(now()) @map("created_at")`);
  lines.push(`  updatedAt DateTime @updatedAt @map("updated_at")`);

  // The same indexes the Cloudflare stack creates, for the same reasons: sorting a list,
  // filtering by status, and finding the rows that point at a record.
  indexes.push(`  @@index([createdAt])`);
  const sortField = resource.defaultSort.field;
  if (!["createdAt", "updatedAt"].includes(sortField) && resource.fields[sortField]) indexes.push(`  @@index([${sortField}])`);
  for (const [key, def] of storedFields(resource)) {
    if (def.kind === "enum" && def.filterable !== false) indexes.push(`  @@index([${key}])`);
  }

  lines.push("", ...[...new Set(indexes)], `  @@map(${q(resource.table)})`, "}");
  return lines.join("\n");
}

/**
 * The header every generated Prisma schema starts with.
 *
 * No `url` in the datasource: Prisma 7 moved connection strings out of the schema and
 * into `prisma.config.ts`, and the client takes a driver adapter instead. The schema now
 * says only which database it is.
 */
export const PRISMA_HEADER = `// Generated by Flare from the descriptors in resources/.
// Edit a descriptor and re-run \`flare gen resource\`; edits here are overwritten.

generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"
}

datasource db {
  provider = "postgresql"
}`;

/** The whole `prisma/schema.prisma`, models in a stable order. */
export function renderPrismaSchema(all: LoadedResource[]): string {
  const ordered = [...all].sort((a, b) => a.resource.name.localeCompare(b.resource.name));
  const blocks = [PRISMA_HEADER];
  for (const entry of ordered) {
    blocks.push(...renderPrismaEnums(entry.resource));
    blocks.push(renderPrismaModel(entry, all));
  }
  return `${blocks.join("\n\n")}\n`;
}
