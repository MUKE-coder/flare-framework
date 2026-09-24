/**
 * Seed files: `seeds/<name>.seed.ts`, run by `flare seed` against the local D1 database.
 *
 *   import { defineSeed } from "@flaredev/core";
 *   import { contacts } from "@/db/schema";
 *
 *   export default defineSeed(async ({ db, insertMany, fake }) => {
 *     await db.insert(contacts).values([{ name: "Ada", email: "ada@example.com" }]);
 *     await insertMany(contacts, 10_000, () => ({ name: fake.fullName(), email: fake.email() }));
 *   });
 */
import type { Fake } from "./fake.js";

/**
 * Insert many rows at once. `rows` is either the rows themselves or a function called
 * once per row, which keeps a million rows out of memory. Far quicker than a Drizzle
 * insert of the same size: the values go into the SQL rather than into D1's
 * 100-parameter budget.
 */
export type InsertMany = <T extends object>(
  table: unknown,
  count: number | readonly T[],
  build?: (index: number) => T,
) => Promise<number>;

export interface SeedContext {
  /**
   * The app's database client: Drizzle over the local D1 database on Cloudflare, the
   * app's own Prisma client on Next.js. Untyped, because which one it is depends on
   * the stack and both are generated per app.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  /** All local bindings and variables (D1, R2, .dev.vars). */
  env: Record<string, unknown>;
  log: (message: string) => void;
  insertMany: InsertMany;
  /** Sample values: names, emails, sentences, dates. */
  fake: Fake;
}

export type Seed = (context: SeedContext) => void | Promise<void>;

export function defineSeed(seed: Seed): Seed {
  return seed;
}
