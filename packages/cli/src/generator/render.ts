import { camelCase, columnName, relationGraph, storedFields, type Resource, type StoredField } from "@flaredev/core";
import type { LoadedResource } from "./load.js";

/** Import name of a descriptor: "order-item" → "orderItemResource" (suffixed so it can never collide with a table export). */
export const resourceLocal = (stem: string) => `${camelCase(stem)}Resource`;

/** Exported Drizzle table name: "order_items" → "orderItems". */
export const tableExport = (resource: Resource) => camelCase(resource.table);

const q = (value: unknown) => JSON.stringify(value);
const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

const TIMESTAMP_DEFAULT = "sql`(cast(unixepoch('subsecond') * 1000 as integer))`";

function columnExpression(key: string, def: StoredField, resources: Map<string, Resource>, selfName: string): string {
  const col = q(columnName(key));
  let expr: string;
  switch (def.kind) {
    case "int":
      expr = `integer(${col})`;
      break;
    case "float":
      expr = `real(${col})`;
      break;
    case "boolean":
      expr = `integer(${col}, { mode: "boolean" })`;
      break;
    case "enum":
      expr = `text(${col}, { enum: ${q(def.options)} })`;
      break;
    case "multiselect":
      // A JSON array of option values; the validators keep it to the listed options.
      expr = `text(${col}, { mode: "json" }).$type<(${def.options.map((option) => q(option)).join(" | ")})[]>()`;
      break;
    case "belongsTo": {
      const target = resources.get(def.target);
      if (!target) {
        throw new Error(`${selfName}.${key} belongs to "${def.target}", but there is no ${def.target} resource. Generate it first.`);
      }
      const onDelete = def.onDelete ?? "restrict";
      expr = `text(${col}).references(() => ${tableExport(target)}.id, { onDelete: ${q(onDelete)} })`;
      break;
    }
    default:
      expr = `text(${col})`;
  }
  if (def.required) expr += ".notNull()";
  if ("unique" in def && def.unique) expr += ".unique()";
  if ("default" in def && def.default !== undefined) expr += `.default(${q(def.default)})`;
  return expr;
}

/** `db/schema/<table>.ts` */
export function renderTableModule(entry: LoadedResource, all: LoadedResource[]): string {
  const { resource } = entry;
  const resources = new Map(all.map((item) => [item.resource.name, item.resource]));
  const fields = storedFields(resource);
  const name = tableExport(resource);

  const columns = fields.map(([key, def]) => `    ${key}: ${columnExpression(key, def, resources, resource.name)},`);
  const extras: string[] = [];
  for (const [key, def] of fields) {
    if (def.kind === "enum") {
      const options = def.options.map(sqlString).join(", ");
      extras.push(`    check(${q(`${resource.table}_${columnName(key)}_check`)}, sql\`\${table.${key}} in (${options})\`),`);
    }
    if (def.kind === "belongsTo") extras.push(`    index(${q(`${resource.table}_${columnName(key)}_idx`)}).on(table.${key}),`);
  }

  const targets = [...new Set(fields.flatMap(([, def]) => (def.kind === "belongsTo" ? [resources.get(def.target)!] : [])))]
    .filter((target) => target.name !== resource.name)
    .sort((a, b) => a.table.localeCompare(b.table));

  const coreImports = ["integer", "sqliteTable", "text"];
  if (fields.some(([, def]) => def.kind === "float")) coreImports.push("real");
  if (extras.some((line) => line.includes("check("))) coreImports.push("check");
  if (extras.some((line) => line.includes("index("))) coreImports.push("index");

  const selfReference = fields.some(([, def]) => def.kind === "belongsTo" && def.target === resource.name);

  return [
    `import { sql } from "drizzle-orm";`,
    `import { ${coreImports.sort().join(", ")} } from "drizzle-orm/sqlite-core";`,
    ...(selfReference ? [`import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";`] : []),
    ...targets.map((target) => `import { ${tableExport(target)} } from "./${target.table}";`),
    "",
    `export const ${name} = sqliteTable(`,
    `  ${q(resource.table)},`,
    "  {",
    `    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),`,
    ...columns.map((line) =>
      selfReference ? line.replace(`() => ${name}.id`, `(): AnySQLiteColumn => ${name}.id`) : line,
    ),
    `    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(${TIMESTAMP_DEFAULT}),`,
    `    updatedAt: integer("updated_at", { mode: "timestamp_ms" })`,
    `      .notNull()`,
    `      .default(${TIMESTAMP_DEFAULT})`,
    `      .$onUpdate(() => new Date()),`,
    "  },",
    ...(extras.length ? ["  (table) => [", ...extras, "  ],"] : []),
    ");",
    "",
  ].join("\n");
}

/** Generated block of `db/schema.ts`: one re-export per resource table, plus relations. */
export function renderSchemaIndex(all: LoadedResource[]): string {
  if (all.length === 0) return "";
  const tables = all
    .map(({ resource }) => resource.table)
    .sort()
    .map((table) => `export * from "./schema/${table}";\n`)
    .join("");
  return `${tables}export * from "./relations";\n`;
}

/**
 * `db/relations.ts`: Drizzle relations for every resource, in one module so tables that
 * reference each other never import each other. Both sides share a relationName, which
 * keeps several belongsTo fields to the same target unambiguous.
 */
export function renderRelations(all: LoadedResource[]): string {
  const resources = all.map(({ resource }) => resource);
  const byName = new Map(resources.map((resource) => [resource.name, resource]));
  const graph = relationGraph(resources);

  const blocks: string[] = [];
  const used = new Set<Resource>();
  for (const resource of [...resources].sort((a, b) => a.table.localeCompare(b.table))) {
    const { belongsTo, hasMany } = graph.byResource[resource.name]!;
    if (belongsTo.length === 0 && hasMany.length === 0) continue;
    const self = tableExport(resource);
    used.add(resource);

    const lines = [
      ...belongsTo.map((relation) => {
        const target = byName.get(relation.target)!;
        used.add(target);
        const other = tableExport(target);
        return `  ${relation.name}: one(${other}, { fields: [${self}.${relation.key}], references: [${other}.id], relationName: ${q(relation.relationName)} }),`;
      }),
      ...hasMany.map((relation) => {
        const target = byName.get(relation.target)!;
        used.add(target);
        return `  ${relation.key}: many(${tableExport(target)}, { relationName: ${q(relation.relationName)} }),`;
      }),
    ];
    const helpers = [belongsTo.length ? "one" : "", hasMany.length ? "many" : ""].filter(Boolean).join(", ");
    blocks.push(`export const ${self}Relations = relations(${self}, ({ ${helpers} }) => ({\n${lines.join("\n")}\n}));\n`);
  }

  if (blocks.length === 0) return "export {};\n";
  const imports = [...used]
    .sort((a, b) => a.table.localeCompare(b.table))
    .map((resource) => `import { ${tableExport(resource)} } from "./schema/${resource.table}";`);
  return [`import { relations } from "drizzle-orm";`, ...imports, "", blocks.join("\n")].join("\n");
}

const handlerImports = (entry: LoadedResource) => [
  `import { createResourceHandlers } from "@flaredev/core/server";`,
  `import { getDb } from "@/db";`,
  `import { ${tableExport(entry.resource)} } from "@/db/schema";`,
  `import { authorize } from "@/lib/api";`,
  `import { revalidateResource } from "@/lib/cache";`,
  `import ${resourceLocal(entry.stem)} from "@/resources/${entry.stem}.resource";`,
  "",
  `const handlers = createResourceHandlers({`,
  `  resource: ${resourceLocal(entry.stem)},`,
  `  table: ${tableExport(entry.resource)},`,
  `  getDb,`,
  `  authorize,`,
  `  onChange: revalidateResource,`,
  `});`,
  "",
];

/** `app/api/<slug>/route.ts`: GET list, POST create. */
export function renderCollectionRoute(entry: LoadedResource): string {
  return [...handlerImports(entry), "export const GET = handlers.collection.GET;", "export const POST = handlers.collection.POST;", ""].join(
    "\n",
  );
}

/** `app/api/<slug>/[id]/route.ts`: GET read, PATCH update, PUT replace, DELETE. */
export function renderItemRoute(entry: LoadedResource): string {
  return [
    ...handlerImports(entry),
    "export const GET = handlers.item.GET;",
    "export const PATCH = handlers.item.PATCH;",
    "export const PUT = handlers.item.PUT;",
    "export const DELETE = handlers.item.DELETE;",
    "",
  ].join("\n");
}

const adminImports = (entry: LoadedResource) => [
  `import ${resourceLocal(entry.stem)} from "@/resources/${entry.stem}.resource";`,
];

/** `app/dashboard/<slug>/page.tsx`: the list view. */
export function renderAdminListPage(entry: LoadedResource): string {
  const local = resourceLocal(entry.stem);
  return [
    `import { PageHeader } from "@/components/dashboard/page-header";`,
    `import { ResourceStats } from "@/components/dashboard/resource-stats";`,
    `import { ResourceTable } from "@/components/dashboard/resource-table";`,
    `import type { SearchParams } from "@/components/dashboard/query";`,
    ...adminImports(entry),
    "",
    `export const metadata = { title: ${local}.pluralLabel };`,
    "",
    `export default async function ${entry.resource.name}ListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {`,
    "  return (",
    "    <>",
    "      <PageHeader",
    `        title={${local}.pluralLabel}`,
    `        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: ${local}.pluralLabel }]}`,
    "      />",
    `      <ResourceStats resource={${local}} />`,
    `      <ResourceTable resource={${local}} searchParams={await searchParams} />`,
    "    </>",
    "  );",
    "}",
    "",
  ].join("\n");
}

/** `app/dashboard/<slug>/new/page.tsx`: the create form. */
export function renderAdminNewPage(entry: LoadedResource): string {
  return [
    `import { ResourceFormPage } from "@/components/dashboard/resource-form-page";`,
    ...adminImports(entry),
    "",
    `export default function New${entry.resource.name}Page() {`,
    `  return <ResourceFormPage resource={${resourceLocal(entry.stem)}} />;`,
    "}",
    "",
  ].join("\n");
}

/** `app/dashboard/<slug>/[id]/edit/page.tsx`: the edit form. */
export function renderAdminEditPage(entry: LoadedResource): string {
  return [
    `import { ResourceFormPage } from "@/components/dashboard/resource-form-page";`,
    ...adminImports(entry),
    "",
    `export default async function Edit${entry.resource.name}Page({ params }: { params: Promise<{ id: string }> }) {`,
    `  return <ResourceFormPage resource={${resourceLocal(entry.stem)}} id={(await params).id} />;`,
    "}",
    "",
  ].join("\n");
}

/** `resources/<stem>.client.ts`: typed REST client and record types. */
export function renderClient(entry: LoadedResource): string {
  const { resource, stem } = entry;
  const local = resourceLocal(stem);
  return [
    `import { createResourceClient } from "@flaredev/core/client";`,
    `import type ${local} from "./${stem}.resource";`,
    "",
    `export const ${camelCase(stem)}Client = createResourceClient<typeof ${local}>(${q(`/api/${resource.slug}`)});`,
    "",
    `export type ${resource.name} = typeof ${local}.$types.record;`,
    `export type ${resource.name}Create = typeof ${local}.$types.create;`,
    `export type ${resource.name}Update = typeof ${local}.$types.update;`,
    "",
  ].join("\n");
}

/** `resources/<stem>.validators.ts`: zod schemas derived from the descriptor at runtime. */
export function renderValidators(entry: LoadedResource): string {
  const local = resourceLocal(entry.stem);
  return [
    `import { createValidators } from "@flaredev/core";`,
    `import ${local} from "./${entry.stem}.resource";`,
    "",
    `export const ${camelCase(entry.stem)}Validators = createValidators(${local});`,
    "",
  ].join("\n");
}

/** Generated block of `resources/index.ts`: every descriptor, for the admin and seeders. */
export function renderRegistry(all: LoadedResource[]): string {
  if (all.length === 0) return "export const resources = [] as const;\n";
  const locals = all.map(({ stem }) => ({ stem, local: resourceLocal(stem) }));
  return [
    ...locals.map(({ stem, local }) => `import ${local} from "./${stem}.resource";`),
    "",
    `export { ${locals.map(({ local }) => local).join(", ")} };`,
    `export const resources = [${locals.map(({ local }) => local).join(", ")}] as const;`,
    "",
  ].join("\n");
}

/**
 * Generated block of `resources/server.ts`: resource name → descriptor + Drizzle table.
 * Server-only (imports the schema); the admin looks resources up here by name.
 */
export function renderServerRegistry(all: LoadedResource[]): string {
  if (all.length === 0) return "export const resourceTables = {} as const;\n";
  const sorted = [...all].sort((a, b) => a.resource.name.localeCompare(b.resource.name));
  return [
    `import { ${sorted.map(({ resource }) => tableExport(resource)).join(", ")} } from "@/db/schema";`,
    `import { ${sorted.map(({ stem }) => resourceLocal(stem)).join(", ")} } from "./index";`,
    "",
    "export const resourceTables = {",
    ...sorted.map(({ resource, stem }) => `  ${resource.name}: { resource: ${resourceLocal(stem)}, table: ${tableExport(resource)} },`),
    "} as const;",
    "",
    "export type ResourceName = keyof typeof resourceTables;",
    "",
  ].join("\n");
}

/** Every file a resource owns, relative to the app root, with its rendered block. */
export function resourceFiles(entry: LoadedResource, all: LoadedResource[]): { path: string; content: string }[] {
  const { resource, stem } = entry;
  return [
    { path: `db/schema/${resource.table}.ts`, content: renderTableModule(entry, all) },
    { path: `app/api/${resource.slug}/route.ts`, content: renderCollectionRoute(entry) },
    { path: `app/api/${resource.slug}/[id]/route.ts`, content: renderItemRoute(entry) },
    { path: `resources/${stem}.client.ts`, content: renderClient(entry) },
    { path: `resources/${stem}.validators.ts`, content: renderValidators(entry) },
    { path: `app/dashboard/${resource.slug}/page.tsx`, content: renderAdminListPage(entry) },
    { path: `app/dashboard/${resource.slug}/new/page.tsx`, content: renderAdminNewPage(entry) },
    { path: `app/dashboard/${resource.slug}/[id]/edit/page.tsx`, content: renderAdminEditPage(entry) },
  ];
}
