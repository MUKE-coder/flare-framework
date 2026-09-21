import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { allowedActions, can, type Policy, type PolicyAction, type Resource } from "@flaredev/core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { createResourceStore, type ResourceStore } from "@flaredev/core/server";
import { getDb } from "@/db";
import { policies } from "@/policies";
import { resourceTables } from "@/resources/server";
import { auth } from "./auth";
import { cached, resourceTag, revalidateResource, TTL } from "./cache";

/**
 * Roles that always reach /admin, whatever the policies say. Other roles get in when a
 * policy grants them read access to at least one resource.
 * Register roles with `flare role:add`, assign with `flare user:role`.
 */
export const ADMIN_ROLES = ["admin", "staff"];

export function policyFor(resourceName: string): Policy | undefined {
  return (policies as Record<string, Policy | undefined>)[resourceName];
}

export async function adminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { session: null, role: null, allowed: false } as const;
  const role = (session.user as { role?: string | null }).role ?? null;
  const readable = adminResources().some((resource) => can(policyFor(resource.name), role, "read"));
  return { session, role, allowed: (role !== null && ADMIN_ROLES.includes(role)) || readable } as const;
}

/** For admin pages: redirects signed-out visitors to sign-in and users without access to the home page. */
export async function requireAdmin(returnTo = "/admin") {
  const { session, role, allowed } = await adminSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  if (!allowed) redirect("/?error=forbidden");
  return { session, role };
}

/**
 * For resource pages: also requires the policy to allow `action` on this resource.
 * Sends the user somewhere they can actually go — the list when they may read it,
 * the dashboard when they may not.
 */
export async function requireAccess(resource: Resource, action: PolicyAction) {
  const { session, role } = await requireAdmin(adminPath(resource));
  const policy = policyFor(resource.name);
  if (!can(policy, role, action)) {
    redirect(action !== "read" && can(policy, role, "read") ? adminPath(resource) : "/admin?error=forbidden");
  }
  return { session, role };
}

/** What the current user may do with a resource, for hiding actions they can't use. */
export async function adminPermissions(resourceName: string) {
  const { role } = await adminSession();
  return allowedActions(policyFor(resourceName), role);
}

const stores = new Map<string, ResourceStore>();

/** CRUD store for a resource by name (404 for unknown names). */
export function adminStore(name: string): ResourceStore {
  const entry = (resourceTables as unknown as Record<string, { resource: Resource; table: SQLiteTable } | undefined>)[name];
  if (!entry) notFound();
  let store = stores.get(name);
  if (!store) {
    store = createResourceStore({ resource: entry.resource, table: entry.table, getDb, onChange: revalidateResource });
    stores.set(name, store);
  }
  return store;
}

/**
 * How many records a resource has. Cached in the data cache under the resource's tag,
 * so the dashboard does not count every table on every visit, and a write through the
 * admin or the API drops the count on its way out.
 */
export function recordCount(name: string): Promise<number> {
  const count = cached(
    async (resourceName: string) => {
      const result = await adminStore(resourceName).list(new URLSearchParams({ perPage: "1" }));
      return result.ok ? result.data.meta.total : 0;
    },
    ["flare", "record-count"],
    { tags: [resourceTag(name)], revalidate: TTL.short },
  );
  return count(name);
}

/** Every resource descriptor (unfiltered): navigation uses `visibleResources()` instead. */
export function adminResources(): Resource[] {
  return Object.values(resourceTables as unknown as Record<string, { resource: Resource }>).map((entry) => entry.resource);
}

/** Resources the current user may read, for the sidebar and dashboard. */
export async function visibleResources(): Promise<Resource[]> {
  const { role } = await adminSession();
  return adminResources().filter((resource) => can(policyFor(resource.name), role, "read"));
}

export function adminPath(resource: Resource, ...parts: string[]) {
  return ["/admin", resource.slug, ...parts].join("/");
}
