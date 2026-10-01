// This file is yours.
//
// Flare copies the code that turns a resource descriptor into a working endpoint into
// your app rather than hiding it in node_modules, for the same reason shadcn/ui copies
// a component: you cannot fix, read or reason about what you cannot see. Nothing here
// is imported from the framework at runtime — change it, delete it, replace it.
//
// `flare diff` shows how your copy differs from the version Flare ships, and
// `flare update` applies the parts you choose. Neither runs unless you ask.

/**
 * The handful of things a resource store needs a database to do.
 *
 * Everything that makes a Flare resource behave the way it does — validation, hooks,
 * computed values, cursors, capped counts, the wording of a constraint error — lives in
 * the store and is the same on every stack. What differs is how rows are actually read
 * and written, and that is this interface: nine operations, described in the
 * descriptor's terms rather than in SQL.
 *
 * Drizzle over SQLite is one implementation; Prisma over Postgres is another. A store
 * built on either behaves identically, which is the whole point — the same descriptor
 * has to mean the same thing on Cloudflare and on Vercel.
 */

export type Row = Record<string, unknown>;

/** What a list needs, before it becomes SQL. */
export interface RowsQuery {
  /** Free-text search across the fields the descriptor marks searchable. */
  search?: { term: string; fields: string[] };
  /** field → value, or null for "is null". */
  filters: Record<string, unknown>;
  /**
   * Which rows a soft-deleting resource should return.
   *
   * `"exclude"` — the default everywhere except the Trash view — means `deleted_at is
   * null`. `filters` cannot express the other two: it says "equals this value, or is
   * null", and `"only"` needs `is not null`.
   *
   * Absent on a resource without `softDelete`, where there is no column to compare.
   */
  deleted?: "exclude" | "only" | "all";
  sort: { field: string; direction: "asc" | "desc" };
  /**
   * Keyset pagination: everything after (or before) this row, compared on
   * `(sort field, id)` together so rows sharing a sort value are neither skipped nor
   * repeated.
   */
  cursor?: {
    field: string;
    value: unknown;
    id: string;
    greaterThan: boolean;
    /**
     * Whether the sort column holds a date.
     *
     * A cursor travels through a URL, so a Date arrives back as a number. SQLite stores
     * dates as milliseconds and wants that number; Postgres wants a Date. Neither
     * adapter can tell which a column is, and the store can — so it says.
     */
    isDate?: boolean;
  };
  limit: number;
  /** Offset paging, for the page-number case. Never combined with a cursor. */
  offset?: number;
}

/** A database refusing a write, in terms the store can turn into a message. */
export type ConstraintHit =
  | { kind: "unique"; column?: string }
  | { kind: "foreignKey" }
  | { kind: "check" };

export interface ResourceRows {
  /** The database handle a descriptor's hooks are given. Drizzle, or a Prisma client. */
  readonly db: unknown;
  find(query: RowsQuery): Promise<Row[]>;
  /** How many rows match, giving up at `limit` so a huge table is never fully counted. */
  countUpTo(query: Pick<RowsQuery, "search" | "filters" | "deleted">, limit: number): Promise<number>;
  byId(id: string): Promise<Row | null>;
  titles(ids: string[], titleField: string): Promise<{ id: string; title: unknown }[]>;
  insert(values: Row): Promise<Row>;
  /** The saved row, or null when there was nothing with that id. */
  update(id: string, values: Row): Promise<Row | null>;
  /** Whether a row was actually removed. */
  remove(id: string): Promise<boolean>;
  /** Recognise a constraint violation, or hand the error back by returning undefined. */
  constraint(error: unknown): ConstraintHit | undefined;
}
