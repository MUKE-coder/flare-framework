import { columnName, storedFields, type Resource } from "../resource/define.js";
import { createValidators } from "../resource/validators.js";
import { drizzleRows, type AnyDatabase } from "./drizzle-rows.js";
import { encodeCursor, isSearchable, parseListQuery, type QueryIssue } from "./query.js";
import type { ResourceRows, Row } from "./rows.js";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

export type { AnyDatabase };

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

/**
 * How far a list will count before it answers "at least this many". Counting a million
 * rows took 900ms even with an index; counting the first 10,000 takes a few.
 */
export const COUNT_LIMIT = 10_000;

/** Dates are stored as milliseconds, and a cursor has to compare the way the column does. */
function toCursorValue(value: unknown): string | number | boolean | null {
  if (value instanceof Date) return value.getTime();
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return String(value);
  return value as string | number | boolean;
}

export interface ListResult<T = Record<string, unknown>> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    /** Rows matching the query, counted up to `COUNT_LIMIT`. */
    total: number;
    totalPages: number;
    /**
     * Whether `total` is the real number. Counting every row of a large table on every
     * page load is the single most expensive thing a list does, so the count stops at
     * `COUNT_LIMIT` and says so; past that, the list pages by cursor.
     */
    exactTotal: boolean;
    /** Carry on from the end of this page, and from its start, without an offset. */
    nextCursor?: string;
    prevCursor?: string;
  };
}

export interface ChangeEvent {
  /** Resource name, e.g. "Deal". */
  resource: string;
  action: "create" | "update" | "delete";
  id: string;
}

export interface ResourceStoreOptions {
  resource: Resource;
  /**
   * Who is making the write, for the descriptor's hooks. The dashboard and the API both
   * know; a seed doesn't, and passes nothing.
   */
  currentUser?: () => Promise<{ id: string; email: string; role?: string | null } | null> | { id: string; email: string; role?: string | null } | null;
  /**
   * The Drizzle table and database, for the Cloudflare stack. Another stack passes
   * `rows` instead — a Prisma-backed one, say — and everything else is identical.
   */
  table?: SQLiteTable;
  getDb?: () => AnyDatabase;
  /** Where rows come from, when it isn't Drizzle. */
  rows?: ResourceRows;
  /**
   * Called after a write succeeds, for cache invalidation. Runs before the
   * operation returns, so a caller that revalidates tags can't hand back a
   * response the cache would then contradict. Failures are logged, not thrown:
   * the write already happened.
   */
  onChange?: (event: ChangeEvent) => void | Promise<void>;
}

/**
 * CRUD operations for one resource, driven by its descriptor. Shared by the REST
 * handlers and the admin's server actions, so validation, constraint handling, and
 * search behave identically everywhere. Operations never throw for expected failures;
 * they return `{ ok: false, status, error }`.
 */
export function createResourceStore(options: ResourceStoreOptions) {
  const { resource, table } = options;
  const validators = createValidators(resource);
  const fields = storedFields(resource);

  if (!options.rows && !(table && options.getDb)) {
    throw new Error(`Resource "${resource.name}": a store needs either a Drizzle table and getDb, or rows.`);
  }
  const rows = options.rows ?? drizzleRows(table!, options.getDb!);

  // Drizzle can say up front whether the table matches the descriptor; a Prisma client
  // can't be asked the same question without a round trip, so that check stays here.
  const columns = "columns" in rows ? (rows.columns as Record<string, { name: string }>) : undefined;
  if (columns) {
    for (const key of ["id", "createdAt", "updatedAt", ...fields.map(([key]) => key)]) {
      if (!columns[key]) {
        throw new Error(`Resource "${resource.name}": table has no column for "${key}". Run \`flare sync-types\` and create a migration.`);
      }
    }
  }
  /** A column name from a constraint error back to the field that owns it. */
  const keyForColumn = (name: string): string | undefined =>
    columns
      ? Object.entries(columns).find(([, column]) => column.name === name)?.[0]
      : ["id", "createdAt", "updatedAt", ...fields.map(([key]) => key)].find((key) => columnName(key) === name || key === name);

  const fail = (status: Failure["status"], error: string, extra: Partial<Failure> = {}): Failure => ({ ok: false, status, error, ...extra });

  /** The same wording whichever database refused the write. */
  function constraintFailure(error: unknown, action: ResourceAction): Failure | undefined {
    const hit = rows.constraint(error);
    if (!hit) return undefined;
    if (hit.kind === "unique") {
      const key = hit.column ? keyForColumn(hit.column) : undefined;
      const label = key ? (resource.fields[key]?.label ?? key) : "Value";
      return fail(409, `${label} is already taken.`, key ? { field: key } : {});
    }
    if (hit.kind === "foreignKey") {
      return action === "delete"
        ? fail(409, `This ${resource.label.toLowerCase()} is still referenced by other records.`)
        : fail(422, "A related record doesn't exist.");
    }
    return fail(422, "A value is outside its allowed options.");
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

  const notFound = () => fail(404, `${resource.label} not found.`);

  const computed = Object.entries(resource.computed ?? {});
  /** Add the descriptor's computed values to a row on its way out. */
  const withComputed = (row: Record<string, unknown>): Record<string, unknown> => {
    if (computed.length === 0) return row;
    const result = { ...row };
    for (const [key, compute] of computed) {
      try {
        result[key] = compute(row);
      } catch {
        // A computed value that throws shouldn't take the record with it.
        result[key] = null;
      }
    }
    return result;
  };

  const hooks = resource.hooks ?? {};
  const hookContext = async () => ({ db: rows.db, user: (await options.currentUser?.()) ?? null });

  return {
    resource,
    table,

    /** `params`: page, perPage, sort, q, filter[field], cursor (as parsed by parseListQuery). */
    async list(params: URLSearchParams): Promise<Result<ListResult>> {
      const parsed = parseListQuery(resource, params);
      if ("issues" in parsed) return fail(400, "Invalid query.", { queryIssues: parsed.issues });
      const { page, perPage, sort, q, filters, cursor } = parsed.query;

      const searchable = fields.filter(([, def]) => isSearchable(def)).map(([key]) => key);
      const matching = { search: q ? { term: q, fields: searchable } : undefined, filters };

      // Reading backwards from a "previous page" cursor means flipping the order and
      // flipping the rows back afterwards.
      const backwards = cursor?.direction === "before";
      const descending = backwards ? sort.direction === "asc" : sort.direction === "desc";

      const [found, counting] = await Promise.all([
        // One row past the limit is enough to know there's more without counting it all.
        rows.find({
          ...matching,
          sort: { field: sort.field, direction: descending ? "desc" : "asc" },
          cursor: cursor ? { field: sort.field, value: cursor.value, id: cursor.id, greaterThan: !descending } : undefined,
          limit: perPage + 1,
          offset: cursor ? undefined : (page - 1) * perPage,
        }),
        rows.countUpTo(matching, COUNT_LIMIT + 1),
      ]);

      // The extra row only tells us another page exists; it isn't part of this one.
      const hasMore = found.length > perPage;
      const page_ = (hasMore ? found.slice(0, perPage) : found).map(withComputed);
      if (backwards) page_.reverse();

      const exactTotal = counting <= COUNT_LIMIT;
      const total = exactTotal ? counting : COUNT_LIMIT;

      const first = page_[0];
      const last = page_[page_.length - 1];
      const moreAfter = backwards ? true : hasMore;
      const moreBefore = backwards ? hasMore : Boolean(cursor) || page > 1;
      const cursorFor = (row: Record<string, unknown> | undefined, direction: "after" | "before") =>
        row ? encodeCursor({ value: toCursorValue(row[sort.field]), id: String(row.id), direction }) : undefined;

      return {
        ok: true,
        data: {
          data: page_,
          meta: {
            page,
            perPage,
            total,
            totalPages: Math.max(1, Math.ceil(total / perPage)),
            exactTotal,
            nextCursor: moreAfter ? cursorFor(last, "after") : undefined,
            prevCursor: moreBefore ? cursorFor(first, "before") : undefined,
          },
        },
      };
    },

    async get(id: string): Promise<Result<Record<string, unknown>>> {
      const record = await rows.byId(id);
      return record ? { ok: true, data: withComputed(record) } : notFound();
    },

    /** Title-field values for a set of ids (for showing relations). Missing ids are omitted. */
    async titles(ids: string[]): Promise<Record<string, string>> {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return {};
      const found = await rows.titles(unique, resource.titleField);
      return Object.fromEntries(found.map((row) => [row.id, row.title == null ? row.id : String(row.title)]));
    },

    create(raw: unknown): Promise<Result<Record<string, unknown>>> {
      return writing("create", async () => {
        const context = await hookContext();
        // The hook runs first so it can fill in what the caller couldn't know — an order
        // number, a slug, a tenant — and whatever it returns is validated like any input.
        const supplied = hooks.beforeCreate ? await hooks.beforeCreate({ ...((raw ?? {}) as object) }, context) : raw;
        const result = validators.create.safeParse(supplied);
        if (!result.success) return invalid(result.error.issues);
        const input = result.data as Record<string, unknown>;
        const now = new Date();
        const record = await rows.insert({ ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now });
        const saved = withComputed(record);
        await hooks.afterCreate?.(saved, context);
        return { ok: true, data: saved };
      });
    },

    /** Partial update (PATCH semantics). */
    update(id: string, raw: unknown): Promise<Result<Record<string, unknown>>> {
      return writing("update", async () => {
        const context = await hookContext();
        const current = hooks.beforeUpdate || hooks.afterUpdate ? await rows.byId(id) : null;
        const supplied = hooks.beforeUpdate ? await hooks.beforeUpdate({ ...((raw ?? {}) as object) }, { ...context, id, current }) : raw;
        const result = validators.update.safeParse(supplied);
        if (!result.success) return invalid(result.error.issues);
        const input = result.data as Record<string, unknown>;
        const record = await rows.update(id, { ...input, updatedAt: new Date() });
        if (!record) return notFound();
        const saved = withComputed(record);
        await hooks.afterUpdate?.(saved, { ...context, previous: current });
        return { ok: true, data: saved };
      });
    },

    /** Full replacement (PUT semantics): omitted fields go back to their default, or null when optional. */
    replace(id: string, input: unknown): Promise<Result<Record<string, unknown>>> {
      const result = validators.create.safeParse(input);
      if (!result.success) return Promise.resolve(invalid(result.error.issues));
      return writing("update", async () => {
        const values: Row = {};
        for (const [key, def] of fields) {
          values[key] = "default" in def && def.default !== undefined ? def.default : def.required ? undefined : null;
        }
        Object.assign(values, result.data, { updatedAt: new Date() });
        const record = await rows.update(id, values);
        return record ? { ok: true, data: withComputed(record) } : notFound();
      });
    },

    delete(id: string): Promise<Result<{ id: string }>> {
      return writing("delete", async () => {
        const context = await hookContext();
        if (hooks.beforeDelete) {
          await hooks.beforeDelete({ ...context, id, current: await rows.byId(id) });
        }
        if (!(await rows.remove(id))) return notFound();
        await hooks.afterDelete?.({ ...context, id });
        return { ok: true, data: { id } };
      });
    },
  };
}

export type ResourceStore = ReturnType<typeof createResourceStore>;
