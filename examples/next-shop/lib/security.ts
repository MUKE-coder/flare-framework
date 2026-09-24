// Request protection for worker/index.ts. Security is off until you run
// `flare gen security`, which rewrites the generated block below.
// generated:start
/** Minimal ExecutionContext surface worker/index.ts passes in. */
export interface SecurityContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** Security is not enabled yet: every request goes straight to the app. */
export async function protect(_request: Request, _env: unknown, _ctx: SecurityContext, next: () => Promise<Response>): Promise<Response> {
  return next();
}
// generated:end
