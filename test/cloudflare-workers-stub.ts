/**
 * Minimal vitest stand-in for the `cloudflare:workers` module, which only exists
 * inside workerd. Real types come from `@cloudflare/workers-types`.
 */
export class DurableObject<Env = unknown> {
  protected ctx: unknown;
  protected env: Env;
  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export const env: Record<string, unknown> = {};
