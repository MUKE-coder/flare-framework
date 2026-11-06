// This file is yours.
//
// Flare copies the code that turns a resource descriptor into a working endpoint into
// your app rather than hiding it in node_modules, for the same reason shadcn/ui copies
// a component: you cannot fix, read or reason about what you cannot see.
//
// `flare diff` shows how your copy differs from the version Flare ships, and
// `flare update` applies the parts you choose. Neither runs unless you ask.

/**
 * Names for the accounts a `belongsTo("User")` field points at — the Prisma half.
 *
 * Better Auth owns the account table, so it is not a Flare resource and has no store to
 * ask — but the admin still has to show "Ada Lovelace" where the column holds a uuid.
 * This is the one place that reads it, and it reads two columns and no more.
 *
 * An account may have no name (a passkey-only sign-up, say), so the email stands in. It
 * is the same fallback `/api/users` uses, so a record reads the same in the table, on
 * the detail page and in the picker.
 */
import { prisma } from "@/lib/db";

/** What the admin needs to treat Better Auth's account table as a relation target. */
export const AUTH_USER_RELATION = {
  name: "User",
  label: "User",
  pluralLabel: "Users",
  slug: "users",
  titleField: "name",
} as const;

/** id → display name, for the ids that exist. Unknown ids are simply absent. */
export async function userTitles(ids: string[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return {};
  const rows = await prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true, email: true } });
  return Object.fromEntries(rows.map((row) => [row.id, row.name?.trim() || row.email]));
}

/**
 * Whether anybody has an account yet.
 *
 * Asked by the sign-up page: the gate in lib/auth.ts always lets the *first* account
 * through, whatever `authConfig.signup` says, because an app nobody can sign into cannot
 * be set up. So "sign-up is closed" is only true once somebody exists.
 */
export async function anyAccountExists(): Promise<boolean> {
  return (await prisma.user.findFirst({ select: { id: true } })) !== null;
}
