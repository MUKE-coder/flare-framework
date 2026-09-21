/**
 * Seed files: `seeds/<name>.seed.ts`, run by `flare seed` against the local D1 database.
 *
 *   import { defineSeed } from "@flaredev/core";
 *   import { contacts } from "@/db/schema";
 *
 *   export default defineSeed(async ({ db }) => {
 *     await db.insert(contacts).values([{ name: "Ada", email: "ada@example.com" }]);
 *   });
 */

export interface SeedContext {
  /** Drizzle client over the app's schema, bound to the local D1 database. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  /** All local bindings and variables (D1, R2, .dev.vars). */
  env: Record<string, unknown>;
  log: (message: string) => void;
}

export type Seed = (context: SeedContext) => void | Promise<void>;

export function defineSeed(seed: Seed): Seed {
  return seed;
}
