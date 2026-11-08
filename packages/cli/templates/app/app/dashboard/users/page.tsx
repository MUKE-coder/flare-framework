import { count, desc } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreateUserButton } from "@/components/dashboard/user-actions";
import { UsersTable } from "@/components/dashboard/users-table";
import { getDb } from "@/db";
import { user } from "@/db/auth-schema";
import { canArea, knownRoles, requireArea } from "@/lib/dashboard";

export const metadata = { title: "Users" };

/**
 * Everyone with an account — there from the first sign-in, before any resource exists.
 *
 * Reading the list is a grant like any other (the Users row on the roles screen).
 * Creating an account and changing a role are not: Better Auth's admin plugin decides
 * those, so the buttons are shown to the people its API will actually obey.
 */
export default async function UsersPage() {
  const { session } = await requireArea("@users");
  const [roles, manage] = await Promise.all([knownRoles(), canArea("@users", "update")]);

  const db = getDb();
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        banned: user.banned,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(200),
    db.select({ total: count() }).from(user),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone who can sign in, newest first — and what each of them is allowed to be."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]}
        actions={manage ? <CreateUserButton roles={roles} /> : undefined}
      />
      <UsersTable rows={rows} total={total} currentUserId={session.user.id} roles={roles} manage={manage} />
    </>
  );
}
