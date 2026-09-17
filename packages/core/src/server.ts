/** Server-only runtime (depends on drizzle-orm): route handlers generated resources mount. */
export {
  createResourceHandlers,
  type Authorize,
  type AuthorizeContext,
  type ResourceAction,
  type ResourceHandlerOptions,
} from "./server/handlers.js";
export { parseListQuery, isFilterable, isSearchable, isSortable, type ListQuery, type QueryIssue } from "./server/query.js";
