// This file is yours.
//
// The small pieces a route handler needs: how a failure becomes a status code, how a
// JSON body is read safely, and the two guards that are easy to forget. Routes call
// these by name so the request flow is visible where it happens, rather than hidden
// behind a factory.
//
// `flare diff` shows how your copy differs from the version Flare ships, and
// `flare update` applies the parts you choose. Neither runs unless you ask.

import type { Resource } from "@flaredev/core";
import type { Failure, ResourceAction, Result } from "./store";

export interface AuthorizeContext {
  request: Request;
  resource: Resource;
  action: ResourceAction;
  id?: string;
}

/** Return a Response (401/403) to deny the request; return nothing to allow it. */
export type Authorize = (context: AuthorizeContext) => Response | void | Promise<Response | void>;

/** The context Next.js and vinext hand a route under `[id]`. */
export type RouteContext = { params: Promise<{ id: string }> };

/** A JSON error response. */
export const problem = (status: number, error: string, extra: object = {}) => Response.json({ error, ...extra }, { status });

/**
 * A store failure as HTTP.
 *
 * The status is decided in store.ts, where the reason is known: 422 with field issues
 * for validation, 409 with the column for a unique conflict, 404 for a missing row.
 */
export function failureResponse(failure: Failure): Response {
  if (failure.queryIssues) return problem(failure.status, failure.error, { issues: failure.queryIssues });
  const extra: Record<string, unknown> = {};
  if (failure.issues) extra.issues = failure.issues;
  if (failure.field) extra.field = failure.field;
  return problem(failure.status, failure.error, extra);
}

/** A store result as HTTP: the data, or the failure above. */
export const respond = <T>(result: Result<T>, init?: ResponseInit) => (result.ok ? Response.json(result.data, init) : failureResponse(result));

/**
 * Whether this write came from another site.
 *
 * Browsers always send `Origin` on POST, PATCH, PUT and DELETE, so a mismatch is a
 * cross-site request, and a request with no `Origin` at all is not from a browser form —
 * which is why a script or a cron job with an API key is not caught by this. It is the
 * CSRF guard; a route that writes should call it.
 *
 * `request.url` alone is not enough to compare against. On the Next.js stack it is built
 * from the server's own idea of its address and ignores the `Host` header entirely: a
 * request to `http://127.0.0.1:3000` arrives with `request.url` saying `localhost:3000`,
 * so a page served from one of those addresses could not write to the other. The host the
 * client actually addressed is in the headers, and either answer matching is same-site.
 *
 * Trusting a forwarded header is sound here, because of what this guard is for. It only
 * has to hold against a browser, and a page cannot set `Origin` or `X-Forwarded-Host` on
 * a request it makes. Anything that can set both already sends no cookie worth stealing.
 */
export const crossOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return origin !== url.origin;
  const scheme = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return origin !== `${scheme}://${host}` && origin !== url.origin;
};

/**
 * The request's JSON body, or the response to send instead.
 *
 * Returns `{ body }` or `{ response }`, so a caller can't forget to handle the bad
 * cases: the wrong content type, or a body that isn't JSON.
 */
export async function readJson(request: Request): Promise<{ body: unknown } | { response: Response }> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) return { response: problem(415, "Send JSON with Content-Type: application/json.") };
  try {
    return { body: await request.json() };
  } catch {
    return { response: problem(400, "Request body isn't valid JSON.") };
  }
}

/**
 * Read and discard a body the handler never consumed.
 *
 * A request answered early — 401, 403, 415 — still has its body waiting. Replying
 * without reading it breaks the *next* request through wrangler's local dev proxy
 * ("Network connection lost"), which is a baffling thing to debug. Routes call this in
 * a `finally`, so it happens whichever way they returned. It streams, so memory stays
 * flat however large the body was.
 */
export async function drain(request: Request): Promise<void> {
  if (!request.body || request.bodyUsed) return;
  try {
    const reader = request.body.getReader();
    while (!(await reader.read()).done);
  } catch {
    // The client went away.
  }
}
