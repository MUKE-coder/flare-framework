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
import { hashPassword } from "./password.js";

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
  /**
   * Creates a user with a credential account, so you can sign in as them straight away:
   *
   *   await seedUser({ email: "ada@example.com", password: "correct-horse-battery", role: "admin" });
   */
  seedUser: SeedUser;
}

/** What `seedUser` needs to make somebody who can sign in. */
export interface SeedUserInput {
  email: string;
  /** Stored as the same PBKDF2 hash the sign-up route writes, so sign-in verifies it. */
  password: string;
  name?: string;
  /** Seeded users are verified by default: an unverified one cannot sign in. */
  emailVerified?: boolean;
  /** e.g. "admin", which the dashboard's policies read. */
  role?: string;
}

/** A user row and the credential account row that lets them sign in. */
export interface CredentialUserRows {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role: string | undefined;
    createdAt: Date;
    updatedAt: Date;
  };
  account: {
    id: string;
    accountId: string;
    providerId: string;
    userId: string;
    password: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * The two rows Better Auth looks for when somebody signs in with a password.
 *
 * `accountId` is the one that is easy to get wrong. It is not the provider's name and it is
 * not the email: for a credential account Better Auth writes the user's own id into that
 * column at sign-up, and looks the account up by it at sign-in. Put the email there instead
 * and everything looks right — the row exists, the hash is correct — but signing in answers
 * "User not found", which is a long afternoon. Both rows are built here so that rule lives
 * in one place rather than in every seed somebody writes by hand.
 */
export async function credentialUserRows(input: SeedUserInput): Promise<CredentialUserRows> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error(`seedUser needs an email address, got "${input.email}".`);
  if (!input.password) throw new Error(`seedUser needs a password for ${email}.`);
  const id = crypto.randomUUID();
  const now = new Date();
  return {
    user: {
      id,
      name: input.name ?? email.split("@")[0]!,
      email,
      emailVerified: input.emailVerified ?? true,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    },
    account: {
      id: crypto.randomUUID(),
      // Not the email. See above.
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(input.password),
      createdAt: now,
      updatedAt: now,
    },
  };
}

/** Creates a user who can actually sign in, and returns the row. */
export type SeedUser = (user: SeedUserInput) => Promise<CredentialUserRows["user"]>;


export type Seed = (context: SeedContext) => void | Promise<void>;

export function defineSeed(seed: Seed): Seed {
  return seed;
}
