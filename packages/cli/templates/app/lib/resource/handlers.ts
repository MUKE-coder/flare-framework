// This file is yours.
//
// Flare copies the code that turns a resource descriptor into a working endpoint into
// your app rather than hiding it in node_modules, for the same reason shadcn/ui copies
// a component: you cannot fix, read or reason about what you cannot see. Nothing here
// is imported from the framework at runtime — change it, delete it, replace it.
//
// `flare diff` shows how your copy differs from the version Flare ships, and
// `flare update` applies the parts you choose. Neither runs unless you ask.

import type { Resource } from "@flaredev/core";
import {
  crossOrigin,
  drain,
  failureResponse,
  problem,
  readJson,
  respond,
  type Authorize,
  type AuthorizeContext,
  type RouteContext,
} from "./http";
import type { ResourceRows } from "./rows";
import {
  createResourceStore,
  type ChangeEvent,
  type Failure,
  type ResourceAction,
  type ResourceStoreOptions,
  type Result,
} from "./store";

export type { ResourceAction } from "./store";

export type { Authorize, AuthorizeContext } from "./http";

export interface ResourceHandlerOptions {
  resource: Resource;
  /** Where rows come from. See {@link ResourceStoreOptions.rows}. */
  rows: ResourceRows;
  authorize: Authorize;
  /** Who is making the request, for the descriptor's hooks. */
  currentUser?: ResourceStoreOptions["currentUser"];
  /** Called after a write succeeds, for cache invalidation. */
  onChange?: (event: ChangeEvent) => void | Promise<void>;
}

/** REST route handlers for a resource: thin HTTP wrappers over `createResourceStore`. */
export function createResourceHandlers(options: ResourceHandlerOptions) {
  const { resource, authorize } = options;
  const store = createResourceStore(options);

  /** The cross-origin guard and the JSON read, in the order a write needs them. */
  const readBody = async (request: Request): Promise<{ body: unknown } | { response: Response }> =>
    crossOrigin(request) ? { response: problem(403, "Cross-origin request blocked.") } : readJson(request);

  const guard = async (context: AuthorizeContext) => (await authorize(context)) ?? undefined;

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
