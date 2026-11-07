import { redirect } from "next/navigation";
import { count, desc } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreateUserButton } from "@/components/dashboard/user-actions";
import { UsersTable } from "@/components/dashboard/users-table";
import { getDb } from "@/db";
import { user } from "@/db/auth-schema";
import { ADMIN_ROLES, dashboardSession } from "@/lib/dashboard";

export const metadata = { title: "Users" };

/**
 * Everyone with an account — there from the first sign-in, before any resource exists.
 *
 * Admin only: the resource policies decide who sees data, but the account list is about
 * the people themselves, so it follows ADMIN_ROLES rather than any one policy.
 */
export default async function UsersPage() {
  const { session, role } = await dashboardSession();
  if (!session) redirect("/sign-in?next=/dashboard/users");
  if (!role || !ADMIN_ROLES.includes(role)) redirect("/dashboard");

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
        actions={<CreateUserButton />}
      />
      <UsersTable rows={rows} total={total} currentUserId={session.user.id} />
    </>
  );
}
