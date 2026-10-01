import { camelCase, columnName, relationGraph, storedFields, type Resource, type StoredField } from "@flaredev/core";
import type { Stack } from "../stack.js";
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
    case "tags":
      // A JSON array of free strings, like multiselect but with no vocabulary to pin.
      expr = `text(${col}, { mode: "json" }).$type<string[]>()`;
      break;
    case "json":
      expr = `text(${col}, { mode: "json" })`;
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
  const indexed = new Set<string>();
  const addIndex = (key: string, column: string) => {
    if (indexed.has(key)) return;
    indexed.add(key);
    extras.push(`    index(${q(`${resource.table}_${columnName(column)}_idx`)}).on(table.${key}),`);
  };

  for (const [key, def] of fields) {
    if (def.kind === "enum") {
      const options = def.options.map(sqlString).join(", ");
      extras.push(`    check(${q(`${resource.table}_${columnName(key)}_check`)}, sql\`\${table.${key}} in (${options})\`),`);
      // The list view filters and counts by enum; both read the index instead of the table.
      if (def.filterable !== false) addIndex(key, key);
    }
    if (def.kind === "belongsTo") addIndex(key, key);
  }

  // The column the list is ordered by. Without this index every page of a large table
  // sorts the whole thing: measured at a million rows, the first page took 34 seconds
  // and `count(*)` 12; with it, 70ms and 130ms.
  const sortKey = resource.defaultSort.field;
  if (sortKey === "createdAt" || sortKey === "updatedAt") addIndex(sortKey, sortKey === "createdAt" ? "created_at" : "updated_at");
  else if (fields.some(([key]) => key === sortKey)) addIndex(sortKey, sortKey);
  // "Newest first" is what the dashboard, the audit trail and most APIs ask for.
  addIndex("createdAt", "created_at");

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

/**
 * The top of a generated route file.
 *
 * Identical on both stacks but for where the rows come from: a Drizzle table and a
 * database on Cloudflare, a Prisma delegate on Next.js. The handlers, the authorization
 * and the cache invalidation are the same either way.
 */
/**
 * The wiring every route of a resource shares: the store, and where its rows come from.
 *
 * The adapter is named rather than implied — it is the one thing about these routes
 * that differs between stacks, so it is written out where you can see it.
 */
const routeHeader = (entry: LoadedResource, stack: Stack) => {
  const local = resourceLocal(entry.stem);
  const source =
    stack === "next"
      ? { imports: [`import { prisma } from "@/lib/db";`], rows: `prismaRows(prisma.${camelCase(entry.resource.name)}, prisma)` }
      : {
          imports: [`import { getDb } from "@/db";`, `import { ${tableExport(entry.resource)} } from "@/db/schema";`],
          rows: `drizzleRows(${tableExport(entry.resource)}, getDb)`,
        };
  const adapter = stack === "next" ? "prismaRows" : "drizzleRows";

  return (helpers: string[]) => [
    `import { createResourceStore, ${[adapter, ...helpers].join(", ")} } from "@/lib/resource";`,
    ...source.imports,
    `import { authorize, currentUser, policyFor } from "@/lib/api";`,
    `import { revalidateResource } from "@/lib/cache";`,
    `import ${local} from "@/resources/${entry.stem}.resource";`,
    "",
    `const store = createResourceStore({`,
    `  resource: ${local},`,
    `  rows: ${source.rows},`,
    `  currentUser,`,
    `  // The role half of the policy is checked by authorize() below; the \`own\` half`,
    `  // restricts which rows exist for this user, which only the store can do.`,
    `  policy: policyFor(${JSON.stringify(entry.resource.name)}),`,
    `  onChange: revalidateResource,`,
    `});`,
    "",
  ];
};

/**
 * `app/api/<slug>/route.ts`: GET list, POST create.
 *
 * Written out rather than delegated. Every step a request goes through is here —
 * the policy check, the CSRF guard, the JSON read, the store call, the response —
 * because a route that names its behaviour instead of showing it is a route you have
 * to take on trust.
 */
export function renderCollectionRoute(entry: LoadedResource, stack: Stack = "cloudflare"): string {
  const local = resourceLocal(entry.stem);
  const plural = entry.resource.pluralLabel.toLowerCase();
  return [
    ...routeHeader(entry, stack)(["crossOrigin", "drain", "failureResponse", "problem", "readJson", "respond"]),
    `/** GET /api/${entry.resource.slug} — list ${plural}. Query: page, perPage, sort, q, filter[field], cursor. */`,
    `export async function GET(request: Request): Promise<Response> {`,
    `  const denied = await authorize({ request, resource: ${local}, action: "list" });`,
    `  if (denied) return denied;`,
    "",
    `  return respond(await store.list(new URL(request.url).searchParams));`,
    `}`,
    "",
    `/** POST /api/${entry.resource.slug} — create one. */`,
    `export async function POST(request: Request): Promise<Response> {`,
    `  try {`,
    `    const denied = await authorize({ request, resource: ${local}, action: "create" });`,
    `    if (denied) return denied;`,
    `    if (crossOrigin(request)) return problem(403, "Cross-origin request blocked.");`,
    "",
    `    const read = await readJson(request);`,
    `    if ("response" in read) return read.response;`,
    "",
    `    const result = await store.create(read.body);`,
    `    if (!result.ok) return failureResponse(result);`,
    "",
    "    const location = `" + "${new URL(request.url).pathname.replace(/\\/$/, \"\")}/${result.data.id as string}`;",
    `    return Response.json(result.data, { status: 201, headers: { location } });`,
    `  } finally {`,
    `    // A body left unread breaks the next request through wrangler's dev proxy.`,
    `    await drain(request);`,
    `  }`,
    `}`,
    "",
  ].join("\n");
}

/** `app/api/<slug>/[id]/route.ts`: GET read, PATCH update, PUT replace, DELETE. */
export function renderItemRoute(entry: LoadedResource, stack: Stack = "cloudflare"): string {
  const local = resourceLocal(entry.stem);
  const one = entry.resource.label.toLowerCase();
  const write = (method: string, action: string, call: string, doc: string) => [
    `/** ${doc} */`,
    `export async function ${method}(request: Request, context: RouteContext): Promise<Response> {`,
    `  try {`,
    `    const { id } = await context.params;`,
    `    const denied = await authorize({ request, resource: ${local}, action: "${action}", id });`,
    `    if (denied) return denied;`,
    `    if (crossOrigin(request)) return problem(403, "Cross-origin request blocked.");`,
    "",
    ...call.split("\n"),
    `  } finally {`,
    `    await drain(request);`,
    `  }`,
    `}`,
    "",
  ];

  return [
    ...routeHeader(entry, stack)(["crossOrigin", "drain", "failureResponse", "problem", "readJson", "respond", "type RouteContext"]),
    `/** GET /api/${entry.resource.slug}/[id] — read one ${one}. */`,
    `export async function GET(request: Request, context: RouteContext): Promise<Response> {`,
    `  const { id } = await context.params;`,
    `  const denied = await authorize({ request, resource: ${local}, action: "read", id });`,
    `  if (denied) return denied;`,
    "",
    `  return respond(await store.get(id));`,
    `}`,
    "",
    ...write(
      "PATCH",
      "update",
      [
        `    const read = await readJson(request);`,
        `    if ("response" in read) return read.response;`,
        "",
        `    return respond(await store.update(id, read.body));`,
      ].join("\n"),
      `PATCH /api/${entry.resource.slug}/[id] — change some fields of one ${one}.`,
    ),
    ...write(
      "PUT",
      "update",
      [
        `    const read = await readJson(request);`,
        `    if ("response" in read) return read.response;`,
        "",
        `    return respond(await store.replace(id, read.body));`,
      ].join("\n"),
      `PUT /api/${entry.resource.slug}/[id] — replace one ${one} entirely.`,
    ),
    ...write(
      "DELETE",
      "delete",
      [`    const result = await store.delete(id);`, `    return result.ok ? new Response(null, { status: 204 }) : failureResponse(result);`].join("\n"),
      `DELETE /api/${entry.resource.slug}/[id] — remove one ${one}.`,
    ),
  ].join("\n");
}

const adminImports = (entry: LoadedResource) => [
  `import ${resourceLocal(entry.stem)} from "@/resources/${entry.stem}.resource";`,
];

/**
 * The `loading.tsx` beside each dashboard page.
 *
 * Next and vinext both render these while the page's own data is awaited, so what
 * they draw should be the page's layout rather than a spinner — the content lands in
 * place instead of replacing something that was moving.
 *
 * Generated per resource so the column and field counts match this resource's table
 * and form, which a shared component couldn't know.
 */
export function renderAdminListLoading(entry: LoadedResource): string {
  // The table shows a column per stored field, plus the row's actions, and stops
  // being worth mimicking past a handful.
  const columns = Math.min(6, storedFields(entry.resource).length + 1);
  return [
    `import { ResourceListSkeleton } from "@/components/dashboard/skeletons";`,
    "",
    `export default function Loading() {`,
    `  return <ResourceListSkeleton columns={${columns}} />;`,
    "}",
    "",
  ].join("\n");
}

export function renderAdminFormLoading(entry: LoadedResource): string {
  const fields = Math.min(8, Math.max(1, storedFields(entry.resource).length));
  return [
    `import { FormSkeleton, PageHeaderSkeleton } from "@/components/dashboard/skeletons";`,
    "",
    `export default function Loading() {`,
    "  return (",
    "    <>",
    "      <PageHeaderSkeleton actions={0} />",
    `      <FormSkeleton fields={${fields}} />`,
    "    </>",
    "  );",
    "}",
    "",
  ].join("\n");
}

export function renderAdminDetailLoading(entry: LoadedResource): string {
  const rows = Math.min(10, Math.max(1, storedFields(entry.resource).length));
  return [
    `import { DetailSkeleton, PageHeaderSkeleton } from "@/components/dashboard/skeletons";`,
    "",
    `export default function Loading() {`,
    "  return (",
    "    <>",
    "      <PageHeaderSkeleton />",
    `      <DetailSkeleton rows={${rows}} />`,
    "    </>",
    "  );",
    "}",
    "",
  ].join("\n");
}

/** `app/dashboard/<slug>/page.tsx`: the list view. */
export function renderAdminListPage(entry: LoadedResource): string {
  const local = resourceLocal(entry.stem);
  return [
    `import { PageHeader } from "@/components/dashboard/page-header";`,
    `import { ResourceChart } from "@/components/dashboard/resource-chart";`,
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
    `      <ResourceChart resource={${local}} />`,
    `      <ResourceTable resource={${local}} searchParams={await searchParams} />`,
    "    </>",
    "  );",
    "}",
    "",
  ].join("\n");
}

/** `app/dashboard/<slug>/[id]/page.tsx`: one record, its relations and its history. */
export function renderAdminDetailPage(entry: LoadedResource): string {
  return [
    `import { RecordDetail } from "@/components/dashboard/record-detail";`,
    ...adminImports(entry),
    "",
    `export default async function ${entry.resource.name}DetailPage({ params }: { params: Promise<{ id: string }> }) {`,
    `  return <RecordDetail resource={${resourceLocal(entry.stem)}} id={(await params).id} />;`,
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

/**
 * `resources/server.ts` for the Next.js stack: the descriptor and its Prisma delegate.
 *
 * The Cloudflare version pairs a resource with a Drizzle table; this one pairs it with
 * `prisma.product` and friends, which is what `prismaRows` needs.
 */
export function renderPrismaServerRegistry(all: LoadedResource[]): string {
  if (all.length === 0) return "export const resourceTables = {} as const;\n";
  const sorted = [...all].sort((a, b) => a.resource.name.localeCompare(b.resource.name));
  return [
    `import { prisma } from "@/lib/db";`,
    `import { ${sorted.map(({ stem }) => resourceLocal(stem)).join(", ")} } from "./index";`,
    "",
    "export const resourceTables = {",
    ...sorted.map(
      ({ resource, stem }) => `  ${resource.name}: { resource: ${resourceLocal(stem)}, delegate: prisma.${camelCase(resource.name)} },`,
    ),
    "} as const;",
    "",
    "export type ResourceName = keyof typeof resourceTables;",
    "",
  ].join("\n");
}

/** Every file a resource owns, relative to the app root, with its rendered block. */
export function resourceFiles(entry: LoadedResource, all: LoadedResource[], stack: Stack = "cloudflare"): { path: string; content: string }[] {
  const { resource, stem } = entry;
  return [
    // The schema is the one file that belongs to a stack. On Next.js every model lives
    // in one prisma/schema.prisma, written by planFiles rather than per resource.
    ...(stack === "cloudflare" ? [{ path: `db/schema/${resource.table}.ts`, content: renderTableModule(entry, all) }] : []),
    { path: `app/api/${resource.slug}/route.ts`, content: renderCollectionRoute(entry, stack) },
    { path: `app/api/${resource.slug}/[id]/route.ts`, content: renderItemRoute(entry, stack) },
    { path: `resources/${stem}.client.ts`, content: renderClient(entry) },
    { path: `resources/${stem}.validators.ts`, content: renderValidators(entry) },
    { path: `app/dashboard/${resource.slug}/page.tsx`, content: renderAdminListPage(entry) },
    { path: `app/dashboard/${resource.slug}/[id]/page.tsx`, content: renderAdminDetailPage(entry) },
    { path: `app/dashboard/${resource.slug}/new/page.tsx`, content: renderAdminNewPage(entry) },
    { path: `app/dashboard/${resource.slug}/[id]/edit/page.tsx`, content: renderAdminEditPage(entry) },
    { path: `app/dashboard/${resource.slug}/loading.tsx`, content: renderAdminListLoading(entry) },
    { path: `app/dashboard/${resource.slug}/new/loading.tsx`, content: renderAdminFormLoading(entry) },
    { path: `app/dashboard/${resource.slug}/[id]/loading.tsx`, content: renderAdminDetailLoading(entry) },
    { path: `app/dashboard/${resource.slug}/[id]/edit/loading.tsx`, content: renderAdminFormLoading(entry) },
  ];
}
