import { redirect } from "next/navigation";
import { grantIndex } from "@flaredev/core";
import { PageHeader } from "@/components/dashboard/page-header";
import { RoleMatrix, type MatrixResource } from "@/components/dashboard/role-matrix";
import { ADMIN_ROLES, allResources, dashboardSession } from "@/lib/dashboard";
import { allGrants, codePolicy, GRANTABLE, listRoles, rolesInUse } from "@/lib/permissions";

export const metadata = { title: "Roles & permissions" };

/**
 * Who may do what, per role.
 *
 * Admin only, and not governed by a resource policy: this screen decides what the
 * policies allow, so gating it on one would be circular. It reads the policy files and
 * the grants together, and shows which ticks came from which — a tick from a file is
 * locked, because the file is the floor and the dashboard only widens it.
 */
export default async function RolesPage() {
  const { session, role } = await dashboardSession();
  if (!session) redirect("/sign-in?next=/dashboard/roles");
  if (!role || !ADMIN_ROLES.includes(role)) redirect("/dashboard");

  const [roles, grants, inUse] = await Promise.all([listRoles(), allGrants(), rolesInUse()]);
  const index = grantIndex(grants);

  // Every role an account could hold, not only the registered ones: the admin plugin's
  // default is "user", and a role assigned with `flare user:role` before anybody opened
  // this screen exists whether or not it was registered here. Showing it is how you
  // discover you have one.
  const known = new Map(roles.map((entry) => [entry.name, entry]));
  for (const name of [...ADMIN_ROLES, "user", ...inUse]) {
    if (!known.has(name)) known.set(name, { name, label: name });
  }

  const resources: MatrixResource[] = allResources().map((resource) => {
    const policy = codePolicy(resource.name);
    const fromCode: Record<string, string[]> = {};
    const granted: Record<string, string[]> = {};
    for (const action of GRANTABLE) {
      fromCode[action] = policy ? policy[action] : [];
      granted[action] = [...(index.get(`${resource.name}.${action}`) ?? [])];
    }
    return { name: resource.name, pluralLabel: resource.pluralLabel, restricted: Boolean(policy), fromCode, granted };
  });

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="What each role may do, per resource. Policy files set the floor; what you tick here widens it."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Roles & permissions" }]}
      />
      <RoleMatrix roles={[...known.values()]} resources={resources} adminRoles={ADMIN_ROLES} />
    </>
  );
}
