/**
 * Typed client for a generated resource's REST API. Browser- and server-safe: no
 * zod or drizzle imports, types come from the descriptor via `import type`.
 *
 *   import type contact from "@/resources/contact.resource";
 *   const contacts = createResourceClient<typeof contact>("/api/contacts");
 *   const { data, meta } = await contacts.list({ q: "ada", sort: "-createdAt" });
 */

export interface ResourceTypes {
  $types: { create: object; update: object; record: object };
}

export interface ListParams {
  page?: number;
  perPage?: number;
  /** Field key, prefixed with "-" for descending. */
  sort?: string;
  q?: string;
  filter?: Record<string, string | number | boolean | null>;
}

export interface ListResult<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export interface ApiIssue {
  path?: string;
  param?: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly issues: ApiIssue[];
  readonly field?: string;

  constructor(status: number, body: { error?: string; issues?: ApiIssue[]; field?: string } | null) {
    super(body?.error ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.issues = body?.issues ?? [];
    this.field = body?.field;
  }
}

export interface ClientOptions {
  /** Origin for server-side use, e.g. "https://example.com". Default: relative URLs. */
  baseURL?: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
}

export function createResourceClient<R extends ResourceTypes>(path: string, options: ClientOptions = {}) {
  type Rec = R["$types"]["record"];
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const root = `${options.baseURL?.replace(/\/+$/, "") ?? ""}${path.replace(/\/+$/, "")}`;

  async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (init.body !== undefined) headers.set("content-type", "application/json");
    headers.set("accept", "application/json");

    const response = await doFetch(url, { credentials: "same-origin", ...init, headers });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, body);
    return body as T;
  }

  const itemUrl = (id: string) => `${root}/${encodeURIComponent(id)}`;

  return {
    list(params: ListParams = {}): Promise<ListResult<Rec>> {
      const search = new URLSearchParams();
      if (params.page !== undefined) search.set("page", String(params.page));
      if (params.perPage !== undefined) search.set("perPage", String(params.perPage));
      if (params.sort) search.set("sort", params.sort);
      if (params.q) search.set("q", params.q);
      for (const [key, value] of Object.entries(params.filter ?? {})) search.set(`filter[${key}]`, String(value));
      const query = search.toString();
      return request(query ? `${root}?${query}` : root);
    },
    get: (id: string): Promise<Rec> => request(itemUrl(id)),
    create: (input: R["$types"]["create"]): Promise<Rec> => request(root, { method: "POST", body: JSON.stringify(input) }),
    /** Partial update (PATCH). */
    update: (id: string, input: R["$types"]["update"]): Promise<Rec> =>
      request(itemUrl(id), { method: "PATCH", body: JSON.stringify(input) }),
    /** Full replacement (PUT): omitted optional fields are cleared. */
    replace: (id: string, input: R["$types"]["create"]): Promise<Rec> =>
      request(itemUrl(id), { method: "PUT", body: JSON.stringify(input) }),
    delete: (id: string): Promise<void> => request(itemUrl(id), { method: "DELETE" }),
  };
}

export type ResourceClient<R extends ResourceTypes> = ReturnType<typeof createResourceClient<R>>;
