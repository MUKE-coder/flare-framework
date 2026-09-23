import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { allowedActions, can, type Policy, type PolicyAction, type Resource } from "@flaredev/core";
import { and, count, gte, lt } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { createResourceStore, type ResourceStore } from "@flaredev/core/server";
import { getDb } from "@/db";
import { policies } from "@/policies";
import { resourceTables } from "@/resources/server";
import { currentUser } from "./api";
import { auth } from "./auth";
import { cached, resourceTag, revalidateResource, TTL } from "./cache";

/**
 * Roles that always reach the dashboard, whatever the policies say. Other roles get in when a
 * policy grants them read access to at least one resource.
 * Register roles with `flare role:add`, assign with `flare user:role`.
 */
export const ADMIN_ROLES = ["admin", "staff"];

export function policyFor(resourceName: string): Policy | undefined {
  return (policies as Record<string, Policy | undefined>)[resourceName];
}

export async function dashboardSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { session: null, role: null, allowed: false } as const;
  const role = (session.user as { role?: string | null }).role ?? null;
  const readable = allResources().some((resource) => can(policyFor(resource.name), role, "read"));
  return { session, role, allowed: (role !== null && ADMIN_ROLES.includes(role)) || readable } as const;
}

/** For admin pages: redirects signed-out visitors to sign-in and users without access to the home page. */
export async function requireDashboard(returnTo = "/dashboard") {
  const { session, role, allowed } = await dashboardSession();
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
  const { session, role } = await requireDashboard(resourcePath(resource));
  const policy = policyFor(resource.name);
  if (!can(policy, role, action)) {
    redirect(action !== "read" && can(policy, role, "read") ? resourcePath(resource) : "/dashboard?error=forbidden");
  }
  return { session, role };
}

/** What the current user may do with a resource, for hiding actions they can't use. */
export async function adminPermissions(resourceName: string) {
  const { role } = await dashboardSession();
  return allowedActions(policyFor(resourceName), role);
}

const stores = new Map<string, ResourceStore>();

/** CRUD store for a resource by name (404 for unknown names). */
export function dashboardStore(name: string): ResourceStore {
  const entry = (resourceTables as unknown as Record<string, { resource: Resource; table: SQLiteTable } | undefined>)[name];
  if (!entry) notFound();
  let store = stores.get(name);
  if (!store) {
    store = createResourceStore({ resource: entry.resource, table: entry.table, getDb, onChange: revalidateResource, currentUser });
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
  const counted = cached(
    async (resourceName: string) => {
      // Counted straight off the table, not through the store: a list stops counting at
      // 10,000 so that paging stays quick, and a stat wants the real number.
      const entry = (resourceTables as unknown as Record<string, { table: SQLiteTable } | undefined>)[resourceName];
      if (!entry) return 0;
      const [row] = await getDb().select({ total: count() }).from(entry.table);
      return row?.total ?? 0;
    },
    ["flare", "record-count"],
    { tags: [resourceTag(name)], revalidate: TTL.short },
  );
  return counted(name);
}

/**
 * How many records hold each value of a field, in one grouped query rather than one
 * count per option. Used by the stats above a resource's table.
 */
export function valueCounts(name: string, field: string): Promise<Record<string, number>> {
  const counted = cached(
    async (resourceName: string, key: string) => {
      const entry = (resourceTables as unknown as Record<string, { table: SQLiteTable } | undefined>)[resourceName];
      const column = entry ? (entry.table as unknown as Record<string, unknown>)[key] : undefined;
      if (!entry || !column) return {};
      const rows = (await getDb()
        .select({ value: column as never, total: count() })
        .from(entry.table)
        .groupBy(column as never)) as { value: unknown; total: number }[];
      return Object.fromEntries(rows.map((row) => [String(row.value ?? ""), row.total]));
    },
    ["flare", "value-counts"],
    { tags: [resourceTag(name)], revalidate: TTL.short },
  );
  return counted(name, field);
}

/**
 * How many records a resource gained in the last `days` days, and in the `days` before
 * that, so a stat can show which way it's going. Cached like the totals.
 */
export function recentCounts(name: string, days = 7): Promise<{ current: number; previous: number }> {
  const counts = cached(
    async (resourceName: string, windowDays: number) => {
      const entry = (resourceTables as unknown as Record<string, { table: SQLiteTable } | undefined>)[resourceName];
      const createdAt = entry ? (entry.table as unknown as Record<string, unknown>).createdAt : undefined;
      // A resource whose table has no createdAt (a custom one) simply has no trend.
      if (!entry || !createdAt) return { current: 0, previous: 0 };
      const window = windowDays * 86_400_000;
      const since = new Date(Date.now() - window);
      const before = new Date(Date.now() - window * 2);
      const column = createdAt as never;
      const [current] = await getDb().select({ total: count() }).from(entry.table).where(gte(column, since));
      const [previous] = await getDb()
        .select({ total: count() })
        .from(entry.table)
        .where(and(gte(column, before), lt(column, since)));
      return { current: current?.total ?? 0, previous: previous?.total ?? 0 };
    },
    ["flare", "recent-count"],
    { tags: [resourceTag(name)], revalidate: TTL.short },
  );
  return counts(name, days);
}

/** Percentage change between two periods, or undefined when there's nothing to compare. */
export function trend(current: number, previous: number): number | undefined {
  if (previous === 0) return current === 0 ? undefined : 100;
  return ((current - previous) / previous) * 100;
}

/** Every resource descriptor (unfiltered): navigation uses `visibleResources()` instead. */
export function allResources(): Resource[] {
  return Object.values(resourceTables as unknown as Record<string, { resource: Resource }>).map((entry) => entry.resource);
}

/** Resources the current user may read, for the sidebar and dashboard. */
export async function visibleResources(): Promise<Resource[]> {
  const { role } = await dashboardSession();
  return allResources().filter((resource) => can(policyFor(resource.name), role, "read"));
}

export function resourcePath(resource: Resource, ...parts: string[]) {
  return ["/dashboard", resource.slug, ...parts].join("/");
}
