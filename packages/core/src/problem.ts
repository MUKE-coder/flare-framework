/**
 * One shape for every error the API returns.
 *
 * There used to be four: `{ error }`, `{ error, field }`, `{ error, issues }` with a
 * `path` in each issue, and `{ error, issues }` with a `param` in each issue instead —
 * plus a plain-text `Access denied.` from the security layer. A client had to handle all
 * of them, and which one it got depended on which guard happened to refuse the request.
 *
 * Now there is one:
 *
 * ```json
 * {
 *   "error": "Number is already taken.",
 *   "code": "unique_violation",
 *   "issues": [{ "path": "number", "message": "Number is already taken.", "code": "unique" }]
 * }
 * ```
 *
 * `error` is for a person — it is the sentence a form or a log shows, and it is the only
 * field whose wording may change between releases. `code` is for a program: it is stable,
 * so a client can translate it, branch on it, or decide whether retrying is worth it.
 * `issues` says which fields, and is present whenever the answer is about fields at all —
 * one issue for a unique conflict, one per failed rule for a validation error, one per
 * bad parameter for a query. A client that only wants to put messages under inputs can
 * read `issues` and ignore everything else.
 */

/**
 * Why a request failed, as a value a program can depend on.
 *
 * Add to this rather than inventing a string at a call site: the point of a code is that
 * it is a closed set a client can switch over.
 */
export const PROBLEM_CODES = {
  /** The body broke a field's rules. `issues` says which fields. */
  validationFailed: "validation_failed",
  /** A unique column already holds this value. `issues` names the column. */
  uniqueViolation: "unique_violation",
  /** Deleting this would orphan rows that point at it. */
  stillReferenced: "still_referenced",
  /** A relation field names a record that does not exist. */
  relatedRecordMissing: "related_record_missing",
  /** A value outside what its column accepts — an enum option that is not one. */
  valueNotAllowed: "value_not_allowed",
  /** No such record, or none this request may see. */
  notFound: "not_found",
  /** A query parameter is wrong. `issues` names the parameters. */
  invalidQuery: "invalid_query",
  /** The body was not JSON. */
  invalidJson: "invalid_json",
  /** The request did not say `Content-Type: application/json`. */
  unsupportedMediaType: "unsupported_media_type",
  /** A write from another origin: the CSRF guard. */
  crossOriginBlocked: "cross_origin_blocked",
  /** No session and no API key. */
  unauthenticated: "unauthenticated",
  /** Signed in, but this role may not do this. */
  forbidden: "forbidden",
  /** Refused by the security layer before the app saw it. */
  accessDenied: "access_denied",
  /** Too many requests. */
  rateLimited: "rate_limited",
  /** A signed storage URL that is missing, malformed, expired, or not for this operation. */
  invalidToken: "invalid_token",
  /** An upload past the limit the signed URL allows. */
  payloadTooLarge: "payload_too_large",
  /** An upload with no Content-Length, which cannot be checked against that limit. */
  lengthRequired: "length_required",
  /** A request that is wrong in a way none of the others describes. */
  badRequest: "bad_request",
  /** Something went wrong that the server does not explain. */
  internal: "internal",
} as const;

export type ProblemCode = (typeof PROBLEM_CODES)[keyof typeof PROBLEM_CODES];

/**
 * Why one field is wrong.
 *
 * `path` is the field key, dotted for a nested one (`address.city`), or the parameter
 * name for a query issue. `code` is optional only because a rule that has no better
 * answer than "invalid" should not be forced to invent one.
 */
export interface ProblemIssue {
  path: string;
  message: string;
  code?: IssueCode;
}

/** Why one field is wrong, as a value a program can depend on. */
export const ISSUE_CODES = {
  /** Broke the field's own rules: a format, a length, a required value. */
  invalid: "invalid",
  /** A unique column already holds this. */
  unique: "unique",
  /** Set once and not changeable — an ownership column, for instance. */
  immutable: "immutable",
  /** A query parameter rather than a body field. */
  invalidParameter: "invalid_parameter",
} as const;

export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];

/** The body of every error response. */
export interface ProblemBody {
  error: string;
  code: ProblemCode;
  issues?: ProblemIssue[];
}

/**
 * Whether this caller wants JSON.
 *
 * Used where a guard answers both browsers and programs — the security layer sits in
 * front of pages as well as the API — because a browser navigation that renders a page of
 * JSON is worse than one that renders a sentence. An `Accept` header asking for JSON, or
 * a path under `/api/`, means a program is asking.
 */
export function wantsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  if (/\bapplication\/json\b/i.test(accept)) return true;
  if (/\btext\/html\b/i.test(accept)) return false;
  return new URL(request.url).pathname.startsWith("/api/");
}

/** An error response in the one shape. */
export function problemResponse(status: number, error: string, code: ProblemCode, issues?: ProblemIssue[], init?: ResponseInit): Response {
  const body: ProblemBody = issues?.length ? { error, code, issues } : { error, code };
  return Response.json(body, { ...init, status });
}
