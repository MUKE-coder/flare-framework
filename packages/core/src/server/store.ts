import { and, asc, count, desc, eq, getTableColumns, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { BaseSQLiteDatabase, SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { storedFields, type Resource } from "../resource/define.js";
import { createValidators } from "../resource/validators.js";
import { isSearchable, parseListQuery, type QueryIssue } from "./query.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDatabase = BaseSQLiteDatabase<"sync" | "async", any, any>;

export type ResourceAction = "list" | "read" | "create" | "update" | "delete";

export interface FieldIssue {
  /** Dotted field path; "" for the whole body (e.g. unknown keys). */
  path: string;
  message: string;
}

export type Failure = {
  ok: false;
  status: 400 | 404 | 409 | 422;
  error: string;
  /** Validation issues per field. */
  issues?: FieldIssue[];
  /** Invalid query parameters. */
  queryIssues?: QueryIssue[];
  /** Field that caused a conflict (e.g. a unique violation). */
  field?: string;
};

export type Result<T> = { ok: true; data: T } | Failure;

export interface ListResult<T = Record<string, unknown>> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export interface ChangeEvent {
  /** Resource name, e.g. "Deal". */
  resource: string;
  action: "create" | "update" | "delete";
  id: string;
}

export interface ResourceStoreOptions {
  resource: Resource;
  table: SQLiteTable;
  getDb: () => AnyDatabase;
  /**
   * Called after a write succeeds, for cache invalidation. Runs before the
   * operation returns, so a caller that revalidates tags can't hand back a
   * response the cache would then contradict. Failures are logged, not thrown:
   * the write already happened.
   */
  onChange?: (event: ChangeEvent) => void | Promise<void>;
}

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

/**
 * CRUD operations for one resource, driven by its descriptor. Shared by the REST
 * handlers and the admin's server actions, so validation, constraint handling, and
 * search behave identically everywhere. Operations never throw for expected failures;
 * they return `{ ok: false, status, error }`.
 */
export function createResourceStore(options: ResourceStoreOptions) {
  const { resource, table, getDb } = options;
  const validators = createValidators(resource);
  const columns = getTableColumns(table) as Record<string, SQLiteColumn>;
  const fields = storedFields(resource);

  for (const key of ["id", "createdAt", "updatedAt", ...fields.map(([key]) => key)]) {
    if (!columns[key]) {
      throw new Error(`Resource "${resource.name}": table has no column for "${key}". Run \`flare sync-types\` and create a migration.`);
    }
  }
  const idColumn = columns.id!;
  const columnKeyByName = new Map(Object.entries(columns).map(([key, column]) => [column.name, key]));

  const fail = (status: Failure["status"], error: string, extra: Partial<Failure> = {}): Failure => ({ ok: false, status, error, ...extra });

  function constraintFailure(error: unknown, action: ResourceAction): Failure | undefined {
    const text = errorText(error);
    const unique = /UNIQUE constraint failed: ([\w.]+(?:, [\w.]+)*)/.exec(text);
    if (unique) {
      const key = columnKeyByName.get(unique[1]!.split(", ")[0]!.split(".").pop()!);
      const label = key ? (resource.fields[key]?.label ?? key) : "Value";
      return fail(409, `${label} is already taken.`, key ? { field: key } : {});
    }
    if (/FOREIGN KEY constraint failed/.test(text)) {
      return action === "delete"
        ? fail(409, `This ${resource.label.toLowerCase()} is still referenced by other records.`)
        : fail(422, "A related record doesn't exist.");
    }
    if (/CHECK constraint failed/.test(text)) return fail(422, "A value is outside its allowed options.");
    return undefined;
  }

  async function guarded<T>(action: ResourceAction, work: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      return await work();
    } catch (error) {
      const failure = constraintFailure(error, action);
      if (failure) return failure;
      throw error;
    }
  }

  /** Announce a successful write. A broken listener must not turn a completed write into an error. */
  async function announce(action: ChangeEvent["action"], result: Result<{ id?: unknown }>): Promise<void> {
    if (!options.onChange || !result.ok) return;
    try {
      await options.onChange({ resource: resource.name, action, id: String(result.data.id) });
    } catch (error) {
      console.error(`[flare] ${resource.name} ${action} cache invalidation failed:`, error);
    }
  }

  /** Run a write, then announce it before handing the result back. */
  async function writing<T extends { id?: unknown }>(
    action: ChangeEvent["action"],
    work: () => Promise<Result<T>>,
  ): Promise<Result<T>> {
    const result = await guarded(action, work);
    await announce(action, result);
    return result;
  }

  const invalid = (issues: { path: PropertyKey[]; message: string }[]) =>
    fail(422, "Validation failed.", { issues: issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })) });

  const byId = (id: string) => eq(idColumn, id);
  const notFound = () => fail(404, `${resource.label} not found.`);

  return {
    resource,
    table,

    /** `params`: page, perPage, sort, q, filter[field] (as parsed by parseListQuery). */
    async list(params: URLSearchParams): Promise<Result<ListResult>> {
      const parsed = parseListQuery(resource, params);
      if ("issues" in parsed) return fail(400, "Invalid query.", { queryIssues: parsed.issues });
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
      return {
        ok: true,
        data: { data: rows as Record<string, unknown>[], meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } },
      };
    },

    async get(id: string): Promise<Result<Record<string, unknown>>> {
      const [record] = await getDb().select().from(table).where(byId(id)).limit(1);
      return record ? { ok: true, data: record as Record<string, unknown> } : notFound();
    },

    /** Title-field values for a set of ids (for showing relations). Missing ids are omitted. */
    async titles(ids: string[]): Promise<Record<string, string>> {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return {};
      const titleColumn = columns[resource.titleField] ?? idColumn;
      const rows = (await getDb().select({ id: idColumn, title: titleColumn }).from(table).where(inArray(idColumn, unique))) as {
        id: string;
        title: unknown;
      }[];
      return Object.fromEntries(rows.map((row) => [row.id, row.title == null ? row.id : String(row.title)]));
    },

    create(input: unknown): Promise<Result<Record<string, unknown>>> {
      const result = validators.create.safeParse(input);
      if (!result.success) return Promise.resolve(invalid(result.error.issues));
      return writing("create", async () => {
        const now = new Date();
        const [record] = await getDb()
          .insert(table)
          .values({ ...(result.data as object), id: crypto.randomUUID(), createdAt: now, updatedAt: now })
          .returning();
        return { ok: true, data: record as Record<string, unknown> };
      });
    },

    /** Partial update (PATCH semantics). */
    update(id: string, input: unknown): Promise<Result<Record<string, unknown>>> {
      const result = validators.update.safeParse(input);
      if (!result.success) return Promise.resolve(invalid(result.error.issues));
      return writing("update", async () => {
        const [record] = await getDb()
          .update(table)
          .set({ ...(result.data as object), updatedAt: new Date() })
          .where(byId(id))
          .returning();
        return record ? { ok: true, data: record as Record<string, unknown> } : notFound();
      });
    },

    /** Full replacement (PUT semantics): omitted fields go back to their default, or null when optional. */
    replace(id: string, input: unknown): Promise<Result<Record<string, unknown>>> {
      const result = validators.create.safeParse(input);
      if (!result.success) return Promise.resolve(invalid(result.error.issues));
      return writing("update", async () => {
        const values: Record<string, unknown> = {};
        for (const [key, def] of fields) {
          values[key] = "default" in def && def.default !== undefined ? def.default : def.required ? undefined : null;
        }
        Object.assign(values, result.data, { updatedAt: new Date() });
        const [record] = await getDb().update(table).set(values).where(byId(id)).returning();
        return record ? { ok: true, data: record as Record<string, unknown> } : notFound();
      });
    },

    delete(id: string): Promise<Result<{ id: string }>> {
      return writing("delete", async () => {
        const deleted = await getDb().delete(table).where(byId(id)).returning({ id: idColumn });
        return deleted.length ? { ok: true, data: { id } } : notFound();
      });
    },
  };
}

export type ResourceStore = ReturnType<typeof createResourceStore>;
