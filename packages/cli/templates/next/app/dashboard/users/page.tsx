import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreateUserButton } from "@/components/dashboard/user-actions";
import { UsersTable } from "@/components/dashboard/users-table";
import { prisma } from "@/lib/db";
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

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        banned: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
      },
    }),
    prisma.user.count(),
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
