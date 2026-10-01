// This file is yours.
//
// Flare copies the code that turns a resource descriptor into a working endpoint into
// your app rather than hiding it in node_modules, for the same reason shadcn/ui copies
// a component: you cannot fix, read or reason about what you cannot see. Nothing here
// is imported from the framework at runtime — change it, delete it, replace it.
//
// `flare diff` shows how your copy differs from the version Flare ships, and
// `flare update` applies the parts you choose. Neither runs unless you ask.

import { columnName, ownershipFilter, storedFields, type Policy, type Resource } from "@flaredev/core";
import { createValidators } from "@flaredev/core";
import { encodeCursor, isSearchable, parseListQuery, type QueryIssue } from "./query";
import type { ResourceRows, Row } from "./rows";


export type ResourceAction = "list" | "read" | "create" | "update" | "delete";

export interface FieldIssue {
  /** Dotted field path; "" for the whole body (e.g. unknown keys). */
  path: string;
  message: string;
}

export type Failure = {
  ok: false;
  status: 400 | 403 | 404 | 409 | 422;
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

/** A cursor is JSON in a URL, so a Date has to cross it as a number. */
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
   * Where rows come from: `drizzleRows(table, getDb)` on Cloudflare,
   * `prismaRows(prisma.model, prisma)` on Next.js, or anything else implementing
   * {@link ResourceRows} — an in-memory fake in a test, an HTTP API, another database.
   *
   * Passed in rather than chosen here on purpose: the adapter is visible at every call
   * site, and this file never has to know which stack it is on.
   */
  rows: ResourceRows;
  /**
   * The resource's policy, when it has one.
   *
   * Only `own` is read here — which rows this user may touch. Whether their role may
   * perform the action at all is decided before the store is reached, by `authorize` on
   * the API and by the dashboard's own check.
   *
   * Ownership applies only when `currentUser` is also given. A store built without one
   * has no session to scope to, which is how a seed or a script writes rows for anybody.
   */
  policy?: Policy | null;
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
  const { resource, rows } = options;
  const validators = createValidators(resource);
  const fields = storedFields(resource);

  // Drizzle can say up front whether the table matches the descriptor; a Prisma client
  // can't be asked the same question without a round trip, so that check stays here.
  const columns = "columns" in rows ? (rows.columns as Record<string, { name: string }>) : undefined;
  if (columns) {
    const expected = ["id", "createdAt", "updatedAt", ...(resource.softDelete ? ["deletedAt"] : []), ...fields.map(([key]) => key)];
    for (const key of expected) {
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

  /**
   * Per-record ownership, from the policy.
   *
   * Caught here rather than at the first request: a policy naming a field the resource
   * doesn't have would otherwise scope every query to a column that doesn't exist, which
   * either errors deep in the adapter or — worse on a flexible store — matches nothing
   * and looks like an empty table.
   */
  const ownership = options.policy?.own;
  if (ownership && !fields.some(([key]) => key === ownership.field)) {
    const known = fields.map(([key]) => key).join(", ");
    throw new Error(
      `Policy ${resource.name}: own.field is "${ownership.field}", which is not a field on ${resource.name}. Fields: ${known}.`,
    );
  }

  /**
   * The owner this call is confined to: `null` to touch every row, or a Failure.
   *
   * Only when a `currentUser` was given — see the option. A policy that restricts rows
   * and a request with no session is a 403, not an unrestricted query: the API refuses
   * that earlier, but the dashboard and server actions come through here too, and a
   * missing session must never widen what a query returns.
   */
  async function confine(): Promise<{ field: string; value: string } | Failure | null> {
    if (!ownership || !options.currentUser) return null;
    const user = await options.currentUser();
    if (!user) return fail(403, "Sign in required.");
    return ownershipFilter(options.policy, user);
  }

  /** Whether `row` belongs to the confined owner. */
  const owns = (row: Row, limit: { field: string; value: string }) => row[limit.field] === limit.value;

  const isFailure = (value: unknown): value is Failure => value !== null && typeof value === "object" && "ok" in value;

  /** Whether a row has been soft-deleted. Always false on a resource that removes rows. */
  const isDeleted = (row: Row) => resource.softDelete && row.deletedAt != null;

  return {
    resource,

    /** `params`: page, perPage, sort, q, filter[field], cursor (as parsed by parseListQuery). */
    async list(params: URLSearchParams, options: { maxPerPage?: number } = {}): Promise<Result<ListResult>> {
      const parsed = parseListQuery(resource, params, options);
      if ("issues" in parsed) return fail(400, "Invalid query.", { queryIssues: parsed.issues });
      const { page, perPage, sort, q, cursor } = parsed.query;

      const limit = await confine();
      if (isFailure(limit)) return limit;
      // Last, so `?filter[userId]=someone-else` cannot widen the query past the owner.
      const filters = limit ? { ...parsed.query.filters, [limit.field]: limit.value } : parsed.query.filters;

      /**
       * Whether a sort column holds a date, so the adapter can shape the cursor for it.
       * The timestamps every row has, plus any date or datetime field.
       */
      const isDateField = (key: string) => {
        if (key === "createdAt" || key === "updatedAt") return true;
        const def = fields.find(([name]) => name === key)?.[1];
        return def?.kind === "date" || def?.kind === "datetime";
      };

      const searchable = fields.filter(([, def]) => isSearchable(def)).map(([key]) => key);
      // A resource that keeps deleted rows hides them unless this list asked for them.
      // Absent otherwise, so an adapter has nothing to compare on a table with no column.
      const deleted = resource.softDelete ? (parsed.query.deleted ?? "exclude") : undefined;
      const matching = { search: q ? { term: q, fields: searchable } : undefined, filters, deleted };

      // Reading backwards from a "previous page" cursor means flipping the order and
      // flipping the rows back afterwards.
      const backwards = cursor?.direction === "before";
      const descending = backwards ? sort.direction === "asc" : sort.direction === "desc";

      const [found, counting] = await Promise.all([
        // One row past the limit is enough to know there's more without counting it all.
        rows.find({
          ...matching,
          sort: { field: sort.field, direction: descending ? "desc" : "asc" },
          cursor: cursor
            ? { field: sort.field, value: cursor.value, id: cursor.id, greaterThan: !descending, isDate: isDateField(sort.field) }
            : undefined,
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

    async get(id: string, options: { deleted?: "exclude" | "only" | "all" } = {}): Promise<Result<Record<string, unknown>>> {
      const limit = await confine();
      if (isFailure(limit)) return limit;
      const record = await rows.byId(id);
      if (!record) return notFound();
      // Not 403: a user who may not see this record should not learn that it exists.
      if (limit && !owns(record, limit)) return notFound();
      // `rows.byId` takes an id and nothing else, so hiding a deleted row happens here.
      // `options.deleted` is how the Trash view and `restore` reach one.
      if (isDeleted(record) && options.deleted !== "only" && options.deleted !== "all") return notFound();
      return { ok: true, data: withComputed(record) };
    },

    /**
     * Title-field values for a set of ids (for showing relations). Missing ids are omitted.
     *
     * Not confined by ownership, and `rows.titles` has no way to be: it returns an id and
     * a title, not the owner. It is called with ids this resource's rows already point at,
     * so in practice it shows the names of records you can already see — but if you hand a
     * confined user a relation picker over a confined resource, the titles are not the
     * place that restriction is enforced. Filter the ids before calling it.
     */
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

        const limit = await confine();
        if (isFailure(limit)) return limit;
        // Before validation, not after: the owner field is usually required, and the
        // client has no business sending it. Set here, a caller cannot create a row in
        // someone else's name, and cannot fail validation for omitting what it can't know.
        const body = limit ? { ...((supplied ?? {}) as object), [limit.field]: limit.value } : supplied;

        const result = validators.create.safeParse(body);
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
        const limit = await confine();
        if (isFailure(limit)) return limit;

        // A confined update has to read the row first: `rows.update(id, …)` takes an id
        // and nothing else, so this is where "is it yours" is answered.
        const current = limit || hooks.beforeUpdate || hooks.afterUpdate ? await rows.byId(id) : null;
        if (limit) {
          if (!current) return notFound();
          if (!owns(current, limit)) return notFound();
        }

        const supplied = hooks.beforeUpdate ? await hooks.beforeUpdate({ ...((raw ?? {}) as object) }, { ...context, id, current }) : raw;

        // Reassigning the owner is refused rather than ignored. Giving a record away is
        // a reasonable thing to want; doing it by accident, because the field was quietly
        // dropped, is not.
        if (limit && supplied && typeof supplied === "object" && limit.field in supplied) {
          const sent = (supplied as Record<string, unknown>)[limit.field];
          if (sent !== limit.value) {
            const label = resource.fields[limit.field]?.label ?? limit.field;
            return fail(422, `You can't change which user this ${resource.label.toLowerCase()} belongs to.`, {
              issues: [{ path: limit.field, message: `${label} can't be changed.` }],
            });
          }
        }

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
        const limit = await confine();
        if (isFailure(limit)) return limit;
        if (limit) {
          const current = await rows.byId(id);
          if (!current || !owns(current, limit)) return notFound();
        }

        const values: Row = {};
        for (const [key, def] of fields) {
          values[key] = "default" in def && def.default !== undefined ? def.default : def.required ? undefined : null;
        }
        Object.assign(values, result.data, { updatedAt: new Date() });
        // PUT resets every field the body left out. Without this the owner field would be
        // one of them, and a replace would quietly orphan the row it just saved.
        if (limit) values[limit.field] = limit.value;

        const record = await rows.update(id, values);
        return record ? { ok: true, data: withComputed(record) } : notFound();
      });
    },

    /**
     * Delete a record. On a `softDelete` resource this stamps `deletedAt` instead of
     * removing the row, and `force` removes it for good.
     *
     * The hooks run either way and in the same order. `beforeDelete` is where a deletion
     * is refused or cleaned up after, and that it happens to be reversible this time does
     * not make it a different event.
     */
    delete(id: string, options: { force?: boolean } = {}): Promise<Result<{ id: string }>> {
      return writing("delete", async () => {
        const context = await hookContext();
        const limit = await confine();
        if (isFailure(limit)) return limit;

        const soft = resource.softDelete && options.force !== true;
        const current = limit || soft || hooks.beforeDelete ? await rows.byId(id) : null;
        if (limit && (!current || !owns(current, limit))) return notFound();

        if (hooks.beforeDelete) {
          await hooks.beforeDelete({ ...context, id, current });
        }

        if (soft) {
          if (!current) return notFound();
          // Already in the trash: say not found rather than moving the date, so the
          // original deletion time survives being deleted twice.
          if (isDeleted(current)) return notFound();
          if (!(await rows.update(id, { deletedAt: new Date(), updatedAt: new Date() }))) return notFound();
        } else if (!(await rows.remove(id))) {
          return notFound();
        }

        await hooks.afterDelete?.({ ...context, id });
        return { ok: true, data: { id } };
      });
    },

    /**
     * Put a soft-deleted record back. `404` for one that is not in the trash, and for a
     * resource that does not keep deleted rows at all — there is nothing to restore.
     */
    restore(id: string): Promise<Result<Record<string, unknown>>> {
      return writing("update", async () => {
        if (!resource.softDelete) return notFound();
        const limit = await confine();
        if (isFailure(limit)) return limit;

        const current = await rows.byId(id);
        if (!current) return notFound();
        if (limit && !owns(current, limit)) return notFound();
        if (!isDeleted(current)) return notFound();

        const record = await rows.update(id, { deletedAt: null, updatedAt: new Date() });
        return record ? { ok: true, data: withComputed(record) } : notFound();
      });
    },
  };
}

export type ResourceStore = ReturnType<typeof createResourceStore>;
