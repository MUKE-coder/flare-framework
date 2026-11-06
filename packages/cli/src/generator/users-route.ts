/**
 * The read-only `/api/users` endpoint that makes `belongsTo("User")` a real relation in
 * the admin.
 *
 * The relation picker finds records through the target's REST API, so that the same
 * authorization applies to the picker as to the resource. Better Auth's account table
 * has no such API — it is not a Flare resource — so without this a `belongsTo("User")`
 * field falls back to a text box and a uuid to paste, which is the thing issue #73 is
 * about.
 *
 * **Who may see whom.** A list of everyone's names and email addresses is not something
 * to hand to anybody who can edit a record, so this endpoint is not a user directory:
 *
 *   - an admin (`ADMIN_ROLES`) gets the searchable list, which is what reassigning a
 *     ticket needs;
 *   - everyone else gets their own account and nothing else, which is what "who reported
 *     it" needs;
 *   - a signed-out request gets 401.
 *
 * So a non-admin can still set the field to themselves and read back the name of whoever
 * is on a record they can already see — `/api/users/<id>` answers for any id, since the
 * record they are looking at already names them — but cannot enumerate the table.
 *
 * Generated only for apps that have a `belongsTo("User")` field somewhere, so an app that
 * does not use the feature does not grow the endpoint.
 */
import { AUTH_USER, isAuthUserTarget, storedFields } from "@flaredev/core";
import type { Stack } from "../stack.js";
import type { LoadedResource } from "./load.js";

/** Whether anything in the app points at the auth user, which is what the route is for. */
export function usesAuthUser(all: LoadedResource[]): boolean {
  return all.some(({ resource }) =>
    [...storedFields(resource)].some(([, def]) => def.kind === "belongsTo" && isAuthUserTarget(def.target)),
  );
}

/** `GET /api/users` — the searchable list, or just you. */
export function renderUsersRoute(stack: Stack): string {
  // One query either way, narrowed to your own row when you are not an admin. Both paths
  // read the same two columns through the same code, so your own name reads the same in
  // the picker as anybody else's — a `currentUser()` shortcut here showed you your email
  // where everyone else got their name.
  const query =
    stack === "next"
      ? `  const search = term
    ? [{ name: { contains: term, mode: "insensitive" as const } }, { email: { contains: term, mode: "insensitive" as const } }]
    : undefined;
  const rows = await prisma.user.findMany({
    where: { ...(mine ? { id: account.id } : {}), ...(search ? { OR: search } : {}) },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }],
    take: perPage,
  });`
      : `  const pattern = \`%\${term}%\`;
  const where = [mine ? eq(user.id, account.id) : undefined, term ? or(like(user.name, pattern), like(user.email, pattern)) : undefined].filter(
    (clause) => clause !== undefined,
  );
  const rows = await getDb()
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(user.name))
    .limit(perPage);`;

  const imports =
    stack === "next"
      ? [`import { prisma } from "@/lib/db";`]
      : [`import { and, asc, eq, like, or } from "drizzle-orm";`, `import { getDb } from "@/db";`, `import { user } from "@/db/auth-schema";`];

  return [
    `import { currentUser } from "@/lib/api";`,
    `import { ADMIN_ROLES } from "@/lib/dashboard";`,
    ...imports,
    "",
    "/**",
    ' * Accounts a `belongsTo("User")` picker can offer.',
    " *",
    " * Admins get the list. Everyone else gets their own account and nothing else: a",
    " * directory of names and email addresses is not something to hand to anybody who can",
    ' * edit a record, and setting "who reported it" to yourself is what the field is',
    " * usually for.",
    " */",
    "export async function GET(request: Request) {",
    "  const account = await currentUser();",
    '  if (!account) return Response.json({ error: "Not signed in" }, { status: 401 });',
    '  const mine = !ADMIN_ROLES.includes(account.role ?? "");',
    "",
    "  const params = new URL(request.url).searchParams;",
    '  const term = (params.get("q") ?? "").trim();',
    '  const perPage = Math.min(Number(params.get("perPage")) || 20, 100);',
    query,
    "",
    "  // `name` is what the picker reads, and an account may not have one.",
    "  return Response.json({",
    "    data: rows.map((row) => ({ id: row.id, name: row.name?.trim() || row.email, email: row.email })),",
    "  });",
    "}",
    "",
  ].join("\n");
}

/** `GET /api/users/[id]` — one account, so a form can show a name instead of a uuid. */
export function renderUserItemRoute(stack: Stack): string {
  const lookup =
    stack === "next"
      ? `  const row = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });`
      : `  const db = getDb();
  const [row] = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, id)).limit(1);`;

  const imports =
    stack === "next"
      ? [`import { prisma } from "@/lib/db";`]
      : [`import { eq } from "drizzle-orm";`, `import { getDb } from "@/db";`, `import { user } from "@/db/auth-schema";`];

  return [
    `import { currentUser } from "@/lib/api";`,
    ...imports,
    "",
    "/**",
    " * One account, by id.",
    " *",
    " * Any signed-in user may ask, because the id came off a record they are already",
    " * looking at — the point is to show \"Ada Lovelace\" where the column holds a uuid.",
    " * Only the display name and email are returned, never the rest of the account.",
    " */",
    "export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {",
    "  const account = await currentUser();",
    '  if (!account) return Response.json({ error: "Not signed in" }, { status: 401 });',
    "  const { id } = await context.params;",
    lookup,
    '  if (!row) return Response.json({ error: "Not found" }, { status: 404 });',
    "  return Response.json({ id: row.id, name: row.name?.trim() || row.email, email: row.email });",
    "}",
    "",
  ].join("\n");
}

/** What the admin needs to treat the auth user as a relation target. */
export const AUTH_USER_META = {
  name: AUTH_USER,
  label: "User",
  pluralLabel: "Users",
  slug: "users",
  titleField: "name",
} as const;
