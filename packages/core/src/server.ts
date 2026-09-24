/** Server-only runtime (depends on drizzle-orm): stores and route handlers for generated resources. */
export {
  createResourceHandlers,
  type Authorize,
  type AuthorizeContext,
  type ResourceHandlerOptions,
} from "./server/handlers.js";
export {
  createResourceStore,
  type AnyDatabase,
  type ChangeEvent,
  type Failure,
  type FieldIssue,
  type ListResult,
  type ResourceAction,
  type ResourceStore,
  type ResourceStoreOptions,
  type Result,
} from "./server/store.js";
export { parseListQuery, isFilterable, isSearchable, isSortable, type ListQuery, type QueryIssue } from "./server/query.js";
// Where rows come from. Drizzle over SQLite on Cloudflare, Prisma over Postgres on
// Next.js; the store on top of either is the same code.
export type { ConstraintHit, ResourceRows, Row, RowsQuery } from "./server/rows.js";
export { drizzleRows } from "./server/drizzle-rows.js";
export { prismaRows, type PrismaDelegate } from "./server/prisma-rows.js";
export { fieldJsonSchema, openApiDocument, type OpenApiOptions } from "./server/openapi.js";
