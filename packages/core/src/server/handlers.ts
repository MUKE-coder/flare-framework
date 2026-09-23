import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Resource } from "../resource/define.js";
import {
  createResourceStore,
  type AnyDatabase,
  type ChangeEvent,
  type Failure,
  type ResourceAction,
  type ResourceStoreOptions,
  type Result,
} from "./store.js";

export type { ResourceAction } from "./store.js";

export interface AuthorizeContext {
  request: Request;
  resource: Resource;
  action: ResourceAction;
  id?: string;
}

/** Return a Response (e.g. 401/403) to deny the request; return nothing to allow it. */
export type Authorize = (context: AuthorizeContext) => Response | void | Promise<Response | void>;

export interface ResourceHandlerOptions {
  resource: Resource;
  table: SQLiteTable;
  getDb: () => AnyDatabase;
  authorize: Authorize;
  /** Who is making the request, for the descriptor's hooks. */
  currentUser?: ResourceStoreOptions["currentUser"];
  /** Called after a write succeeds, for cache invalidation. */
  onChange?: (event: ChangeEvent) => void | Promise<void>;
}

type RouteContext = { params: Promise<{ id: string }> };

const problem = (status: number, error: string, extra: object = {}) => Response.json({ error, ...extra }, { status });

function failureResponse(failure: Failure): Response {
  if (failure.queryIssues) return problem(failure.status, failure.error, { issues: failure.queryIssues });
  const extra: Record<string, unknown> = {};
  if (failure.issues) extra.issues = failure.issues;
  if (failure.field) extra.field = failure.field;
  return problem(failure.status, failure.error, extra);
}

const respond = <T>(result: Result<T>, init?: ResponseInit) =>
  result.ok ? Response.json(result.data, init) : failureResponse(result);

/** REST route handlers for a resource: thin HTTP wrappers over `createResourceStore`. */
export function createResourceHandlers(options: ResourceHandlerOptions) {
  const { resource, authorize } = options;
  const store = createResourceStore(options);

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

  const guard = async (context: AuthorizeContext) => (await authorize(context)) ?? undefined;

  /**
   * Read and drop a body the handler didn't consume (a 401/403/415 answered early).
   * Answering with it unread breaks the next request through wrangler's local dev
   * proxy ("Network connection lost"). Streams, so memory stays flat.
   */
  async function drain(request: Request) {
    if (!request.body || request.bodyUsed) return;
    try {
      const reader = request.body.getReader();
      while (!(await reader.read()).done);
    } catch {
      // The client went away.
    }
  }
  const draining =
    <Rest extends unknown[]>(handler: (request: Request, ...rest: Rest) => Promise<Response>) =>
    async (request: Request, ...rest: Rest): Promise<Response> => {
      const response = await handler(request, ...rest);
      await drain(request);
      return response;
    };

  async function GET(request: Request): Promise<Response> {
    const denied = await guard({ request, resource, action: "list" });
    if (denied) return denied;
    return respond(await store.list(new URL(request.url).searchParams));
  }

  async function POST(request: Request): Promise<Response> {
    const denied = await guard({ request, resource, action: "create" });
    if (denied) return denied;
    const read = await readBody(request);
    if ("response" in read) return read.response;
    const result = await store.create(read.body);
    if (!result.ok) return failureResponse(result);
    const location = `${new URL(request.url).pathname.replace(/\/$/, "")}/${result.data.id as string}`;
    return Response.json(result.data, { status: 201, headers: { location } });
  }

  async function item(request: Request, context: RouteContext, action: ResourceAction, work: (id: string) => Promise<Response>) {
    const { id } = await context.params;
    const denied = await guard({ request, resource, action, id });
    if (denied) return denied;
    return work(id);
  }

  const withBody = (request: Request, run: (body: unknown) => Promise<Response>) =>
    readBody(request).then((read) => ("response" in read ? read.response : run(read.body)));

  const itemHandlers = {
    GET: (request: Request, context: RouteContext) => item(request, context, "read", async (id) => respond(await store.get(id))),
    PATCH: (request: Request, context: RouteContext) =>
      item(request, context, "update", (id) => withBody(request, async (body) => respond(await store.update(id, body)))),
    PUT: (request: Request, context: RouteContext) =>
      item(request, context, "update", (id) => withBody(request, async (body) => respond(await store.replace(id, body)))),
    DELETE: (request: Request, context: RouteContext) =>
      item(request, context, "delete", async (id) => {
        if (crossOrigin(request)) return problem(403, "Cross-origin request blocked.");
        const result = await store.delete(id);
        return result.ok ? new Response(null, { status: 204 }) : failureResponse(result);
      }),
  };

  return {
    collection: { GET, POST: draining(POST) },
    item: {
      GET: itemHandlers.GET,
      PATCH: draining(itemHandlers.PATCH),
      PUT: draining(itemHandlers.PUT),
      DELETE: draining(itemHandlers.DELETE),
    },
    store,
  };
}
