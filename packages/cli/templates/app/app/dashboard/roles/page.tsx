import { grantIndex } from "@flaredev/core";
import { PageHeader } from "@/components/dashboard/page-header";
import { RoleMatrix, type MatrixArea, type MatrixResource } from "@/components/dashboard/role-matrix";
import { dashboardAreas } from "@/lib/areas";
import { ADMIN_ROLES, allResources, knownRoles, requireArea } from "@/lib/dashboard";
import { allGrants, codePolicy, GRANTABLE } from "@/lib/permissions";

export const metadata = { title: "Roles & permissions" };

/**
 * Who may do what, per role.
 *
 * Two grids, and they work the same way. **Resources** take their locked ticks from
 * `policies/<name>.policy.ts`; the dashboard's own **pages** take theirs from
 * ADMIN_ROLES, and from lib/auth.ts for the few things Better Auth owns. In both the
 * code is the floor and a tick here only ever widens it.
 *
 * Gated on its own area, not on ADMIN_ROLES: an app that wants a second role able to
 * manage permissions should be able to say so here, which is the whole point of the
 * screen. Admin is the floor and cannot be removed.
 */
export default async function RolesPage() {
  await requireArea("@roles");

  const [roles, grants] = await Promise.all([knownRoles(), allGrants()]);
  const index = grantIndex(grants);
  const granted = (key: string, action: string) => [...(index.get(`${key}.${action}`) ?? [])];

  const resources: MatrixResource[] = allResources().map((resource) => {
    const policy = codePolicy(resource.name);
    const fromCode: Record<string, string[]> = {};
    const open: Record<string, string[]> = {};
    for (const action of GRANTABLE) {
      fromCode[action] = policy ? policy[action] : [];
      open[action] = granted(resource.name, action);
    }
    return { name: resource.name, pluralLabel: resource.pluralLabel, restricted: Boolean(policy), fromCode, granted: open };
  });

  // ADMIN_ROLES is the floor for every area, so those ticks are locked for the same
  // reason a policy file's are: this screen widens, it never narrows.
  const areas: MatrixArea[] = dashboardAreas().map((area) => ({
    id: area.id,
    label: area.label,
    blurb: area.blurb,
    actions: area.actions,
    locked: area.locked ?? {},
    caution: area.caution,
    fromCode: Object.fromEntries(area.actions.map((action) => [action, ADMIN_ROLES])),
    granted: Object.fromEntries(area.actions.map((action) => [action, granted(area.id, action)])),
  }));

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="What each role may do — your resources, and the dashboard's own pages. Code sets the floor; what you tick here widens it."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Roles & permissions" }]}
      />
      <RoleMatrix roles={roles} resources={resources} areas={areas} adminRoles={ADMIN_ROLES} />
    </>
  );
}
