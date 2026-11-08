import { withGrants, type PermissionGrant, type Policy, type PolicyAction } from "@flaredev/core";
import { dashboardLinks } from "./dashboard-nav";

/**
 * The dashboard's own pages, as things a role can be granted.
 *
 * Resources have policy files; these pages do not, because they are not resources —
 * Users is accounts, Observability is the audit log, the API reference is a document.
 * Without this they were all gated on `ADMIN_ROLES`, which meant one answer for the
 * whole app: either you were an admin and saw every one of them, or you saw none. A
 * support role that should read the audit log and nothing else had nowhere to be
 * described.
 *
 * So each page is an **area**, and an area behaves exactly like a resource on the roles
 * screen: `ADMIN_ROLES` is the floor (the ticks that are locked), and a grant in the
 * database widens it. Nothing here can take access away from an admin, for the same
 * reason a grant cannot narrow a policy file — see `withGrants` in @flaredev/core.
 *
 * The list is derived, not hand-maintained: the three Manage pages ship with every app,
 * and everything under Platform comes from `dashboardLinks`, so a page added by
 * `flare gen security` is grantable the moment it appears in the sidebar.
 */

export type AreaAction = Exclude<PolicyAction, "list">;

export interface DashboardArea {
  /** The grant key. The leading `@` keeps it out of the resource-name space for good. */
  id: string;
  label: string;
  href: string;
  /** What the page is, said once, on the roles screen. */
  blurb: string;
  /** The actions that mean something here, in the order the matrix shows them. */
  actions: AreaAction[];
  /**
   * Actions some other layer decides, with the reason. They are shown locked and a grant
   * on them is ignored — a tick that the next request refuses is worse than no tick.
   */
  locked?: Partial<Record<AreaAction, string>>;
  /** Worth reading before ticking anything in this row. */
  caution?: string;
}

/**
 * A page's grant key, from its path: `/dashboard/costs` → `@dashboard-costs`.
 *
 * Derived rather than declared so a generated link needs no registration anywhere, and
 * stable because it is the href — a page that moves is a different page.
 */
export function areaId(href: string): string {
  return `@${href.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

/**
 * Better Auth's admin plugin — not this screen — decides who may create an account, set
 * a role or ban somebody: `adminRoles` in lib/auth.ts, "admin" out of the box. Granting
 * those here would show a tick that its API refuses, so they are locked and the tooltip
 * says where to change them. Reading the list is ours to give.
 */
const AUTH_OWNED = "Better Auth decides this: adminRoles in lib/auth.ts";

/** The three pages every dashboard has, whatever the app does. */
const MANAGE: DashboardArea[] = [
  {
    id: "@users",
    label: "Users",
    href: "/dashboard/users",
    blurb: "Everyone who can sign in, and the role each of them holds",
    actions: ["read", "create", "update"],
    locked: { create: AUTH_OWNED, update: AUTH_OWNED },
  },
  {
    id: "@roles",
    label: "Roles & permissions",
    href: "/dashboard/roles",
    blurb: "This screen",
    actions: ["read", "update"],
    caution: "A role that may change this screen can grant itself everything else on it.",
  },
  {
    id: "@observability",
    label: "Observability",
    href: "/dashboard/observability",
    blurb: "Traffic, how much the database holds, and who changed what",
    actions: ["read"],
  },
];

/** Platform pages that are more than something to read. Everything else is read-only. */
const LINK_ACTIONS: Record<string, AreaAction[]> = {
  "/dashboard/invitations": ["read", "create", "delete"],
};

const LINK_BLURBS: Record<string, string> = {
  "/dashboard/costs": "What this app holds, and what it would cost to run",
  "/dashboard/invitations": "Who has been invited, and the form that invites them",
  // Unless lib/api-docs.ts sets visibility to "public", in which case the page is for
  // everyone and this grant only decides who gets the link.
  "/api/reference": "This app's own API, documented from its descriptors",
};

/** Every area, in the order the sidebar shows them. */
export function dashboardAreas(): DashboardArea[] {
  return [
    ...MANAGE,
    ...dashboardLinks.map((link) => ({
      id: areaId(link.href),
      label: link.label,
      href: link.href,
      blurb: LINK_BLURBS[link.href] ?? "A page in this dashboard",
      actions: LINK_ACTIONS[link.href] ?? (["read"] as AreaAction[]),
    })),
  ];
}

export function findArea(id: string): DashboardArea | undefined {
  return dashboardAreas().find((area) => area.id === id);
}

/**
 * The area with this id, or a stand-in that is admin-only.
 *
 * A page can exist without being offered: Invitations ships with every app but is only
 * linked when sign-up is by invitation, and it explains that when you open it. With no
 * area to describe it, it has no grants — but the floor still applies, so an admin can
 * still read it. The alternative was a page that exists and refuses everybody.
 */
export function areaOrFloor(id: string): DashboardArea {
  return findArea(id) ?? { id, label: id, href: "/dashboard", blurb: "", actions: [] };
}

/**
 * The policy enforced for an area: `adminRoles` is the floor, and grants widen it.
 *
 * Grants on an action the area does not have, or on one another layer owns, are dropped
 * rather than applied. A row in a table outliving the page it was written for must not
 * quietly mean something new.
 */
export function areaPolicy(area: DashboardArea, adminRoles: string[], grants: Iterable<PermissionGrant>): Policy {
  const floor: Policy = {
    resource: area.id,
    read: [...adminRoles],
    create: [...adminRoles],
    update: [...adminRoles],
    delete: [...adminRoles],
  };
  const usable = [...grants].filter(
    (grant) => grant.resource === area.id && area.actions.includes(grant.action) && !area.locked?.[grant.action],
  );
  return withGrants(floor, area.id, usable) ?? floor;
}
