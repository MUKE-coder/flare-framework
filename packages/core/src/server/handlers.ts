import { and, asc, count, desc, eq, getTableColumns, isNull, or, sql, type SQL } from "drizzle-orm";
import type { BaseSQLiteDatabase, SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { storedFields, type Resource } from "../resource/define.js";
import { createValidators } from "../resource/validators.js";
import { isSearchable, parseListQuery } from "./query.js";

export type ResourceAction = "list" | "read" | "create" | "update" | "delete";

export interface AuthorizeContext {
  request: Request;
  resource: Resource;
  action: ResourceAction;
  id?: string;
}

/** Return a Response (e.g. 401/403) to deny the request; return nothing to allow it. */
export type Authorize = (context: AuthorizeContext) => Response | void | Promise<Response | void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDatabase = BaseSQLiteDatabase<"sync" | "async", any, any>;

export interface ResourceHandlerOptions {
  resource: Resource;
  table: SQLiteTable;
  getDb: () => AnyDatabase;
  authorize: Authorize;
}

type RouteContext = { params: Promise<{ id: string }> };

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);
const problem = (status: number, error: string, extra: object = {}) => json({ error, ...extra }, { status });

/** Walks an error and its causes (drizzle and D1 both wrap SQLite errors). */
function errorText(error: unknown): string {
  const parts: string[] = [];
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" | ");
}

export function createResourceHandlers(options: ResourceHandlerOptions) {
  const { resource, table, getDb, authorize } = options;
  const validators = createValidators(resource);
  const columns = getTableColumns(table) as Record<string, SQLiteColumn>;
  const fields = storedFields(resource);

  for (const key of ["id", "createdAt", "updatedAt", ...fields.map(([key]) => key)]) {
    if (!columns[key]) {
      throw new Error(
        `Resource "${resource.name}": table has no column for "${key}". Run \`flare sync-types\` and create a migration.`,
      );
    }
  }
  const idColumn = columns.id!;
  const columnKeyByName = new Map(Object.entries(columns).map(([key, column]) => [column.name, key]));

  const constraintResponse = (error: unknown, action: ResourceAction): Response | undefined => {
    const text = errorText(error);
    const unique = /UNIQUE constraint failed: ([\w.]+(?:, [\w.]+)*)/.exec(text);
    if (unique) {
      const key = columnKeyByName.get(unique[1]!.split(", ")[0]!.split(".").pop()!);
      const label = key ? (resource.fields[key]?.label ?? key) : "Value";
      return problem(409, `${label} is already taken.`, key ? { field: key } : {});
    }
    if (/FOREIGN KEY constraint failed/.test(text)) {
      return action === "delete"
        ? problem(409, `This ${resource.label.toLowerCase()} is still referenced by other records.`)
        : problem(422, "A related record doesn't exist.");
    }
    if (/CHECK constraint failed/.test(text)) return problem(422, "A value is outside its allowed options.");
    return undefined;
  };

  /** Deny cross-site writes: browsers send Origin on POST/PATCH/PUT/DELETE. */
  const crossOrigin = (request: Request) => {
    const origin = request.headers.get("origin");
    return origin !== null && origin !== new URL(request.url).origin;
  };

  async function readBody(request: Request): Promise<{ body: unknown } | { response: Response }> {
    if (crossOrigin(request)) return { response: problem(403, "Cross-origin request blocked.") };
    const type = request.headers.get("content-type") ?? "";
    if (!/^application\/json\b/i.test(type)) return { response: problem(415, "Send JSON with Content-Type: application/json.") };
    try {
      return { body: await request.json() };
    } catch {
      return { response: problem(400, "Request body isn't valid JSON.") };
    }
  }

  const validationError = (issues: { path: PropertyKey[]; message: string }[]) =>
    problem(422, "Validation failed.", {
      issues: issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })),
    });

  async function guard(context: AuthorizeContext): Promise<Response | undefined> {
    return (await authorize(context)) ?? undefined;
  }

  async function run(action: ResourceAction, work: () => Promise<Response>): Promise<Response> {
    try {
      return await work();
    } catch (error) {
      const mapped = constraintResponse(error, action);
      if (mapped) return mapped;
      throw error;
    }
  }

  const byId = (id: string) => eq(idColumn, id);

  // ---- Collection: GET (list), POST (create) --------------------------------

  async function GET(request: Request): Promise<Response> {
    const denied = await guard({ request, resource, action: "list" });
    if (denied) return denied;

    const parsed = parseListQuery(resource, new URL(request.url).searchParams);
    if ("issues" in parsed) return problem(400, "Invalid query.", { issues: parsed.issues });
    const { page, perPage, sort, q, filters } = parsed.query;

    const conditions: SQL[] = [];
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      const searchable = fields.filter(([, def]) => isSearchable(def)).map(([key]) => columns[key]!);
      if (searchable.length) conditions.push(or(...searchable.map((column) => sql`${column} LIKE ${pattern} ESCAPE '\\'`))!);
    }
    for (const [key, value] of Object.entries(filters)) {
      conditions.push(value === null ? isNull(columns[key]!) : eq(columns[key]!, value));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const order = sort.direction === "asc" ? asc(columns[sort.field]!) : desc(columns[sort.field]!);

    const db = getDb();
    const [rows, totals] = await Promise.all([
      db.select().from(table).where(where).orderBy(order, asc(idColumn)).limit(perPage).offset((page - 1) * perPage),
      db.select({ total: count() }).from(table).where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    return json({ data: rows, meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } });
  }

  async function POST(request: Request): Promise<Response> {
    const denied = await guard({ request, resource, action: "create" });
    if (denied) return denied;
    const read = await readBody(request);
    if ("response" in read) return read.response;
    const result = validators.create.safeParse(read.body);
    if (!result.success) return validationError(result.error.issues);

    return run("create", async () => {
      const now = new Date();
      const [record] = await getDb()
        .insert(table)
        .values({ ...(result.data as object), id: crypto.randomUUID(), createdAt: now, updatedAt: now })
        .returning();
      const location = `${new URL(request.url).pathname.replace(/\/$/, "")}/${(record as { id: string }).id}`;
      return json(record, { status: 201, headers: { location } });
    });
  }

  // ---- Item: GET (read), PATCH (update), PUT (replace), DELETE ---------------

  async function item(request: Request, context: RouteContext, action: ResourceAction, work: (id: string) => Promise<Response>) {
    const { id } = await context.params;
    const denied = await guard({ request, resource, action, id });
    if (denied) return denied;
    return run(action, () => work(id));
  }

  const notFound = () => problem(404, `${resource.label} not found.`);

  const itemHandlers = {
    GET: (request: Request, context: RouteContext) =>
      item(request, context, "read", async (id) => {
        const [record] = await getDb().select().from(table).where(byId(id)).limit(1);
        return record ? json(record) : notFound();
      }),

    PATCH: (request: Request, context: RouteContext) =>
      item(request, context, "update", async (id) => {
        const read = await readBody(request);
        if ("response" in read) return read.response;
        const result = validators.update.safeParse(read.body);
        if (!result.success) return validationError(result.error.issues);
        const [record] = await getDb()
          .update(table)
          .set({ ...(result.data as object), updatedAt: new Date() })
          .where(byId(id))
          .returning();
        return record ? json(record) : notFound();
      }),

    PUT: (request: Request, context: RouteContext) =>
      item(request, context, "update", async (id) => {
        const read = await readBody(request);
        if ("response" in read) return read.response;
        const result = validators.create.safeParse(read.body);
        if (!result.success) return validationError(result.error.issues);
        // Full replacement: omitted fields go back to their default, or null when optional.
        const values: Record<string, unknown> = {};
        for (const [key, def] of fields) {
          values[key] = "default" in def && def.default !== undefined ? def.default : def.required ? undefined : null;
        }
        Object.assign(values, result.data, { updatedAt: new Date() });
        const [record] = await getDb().update(table).set(values).where(byId(id)).returning();
        return record ? json(record) : notFound();
      }),

    DELETE: (request: Request, context: RouteContext) =>
      item(request, context, "delete", async (id) => {
        if (crossOrigin(request)) return problem(403, "Cross-origin request blocked.");
        const deleted = await getDb().delete(table).where(byId(id)).returning({ id: idColumn });
        return deleted.length ? new Response(null, { status: 204 }) : notFound();
      }),
  };

  return { collection: { GET, POST }, item: itemHandlers };
}
