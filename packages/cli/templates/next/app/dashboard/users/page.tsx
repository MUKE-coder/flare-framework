import { PageHeader } from "@/components/dashboard/page-header";
import { CreateUserButton } from "@/components/dashboard/user-actions";
import { UsersTable } from "@/components/dashboard/users-table";
import { prisma } from "@/lib/db";
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
        actions={manage ? <CreateUserButton roles={roles} /> : undefined}
      />
      <UsersTable rows={rows} total={total} currentUserId={session.user.id} roles={roles} manage={manage} />
    </>
  );
}
