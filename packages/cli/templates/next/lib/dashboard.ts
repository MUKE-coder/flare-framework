import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { allowedActions, can, columnName, type Policy, type PolicyAction, type Resource } from "@flaredev/core";
import { createResourceStore, prismaRows, type PrismaDelegate, type ResourceStore } from "@flaredev/core/server";
import { prisma } from "@/lib/db";
import { policies } from "@/policies";
import { resourceTables } from "@/resources/server";
import { currentUser } from "./api";
import { auth } from "./auth";
import { cached, resourceTag, revalidateResource, TTL } from "./cache";

/**
 * The dashboard's view of a resource, on the Next.js stack.
 *
 * The same shape as the Cloudflare one — same exports, same behaviour — over Prisma and
 * Postgres instead of Drizzle and D1. The store itself is shared: only where its rows
 * come from differs.
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
  const entry = (resourceTables as unknown as Record<string, { resource: Resource; delegate: PrismaDelegate } | undefined>)[name];
  if (!entry) notFound();
  let store = stores.get(name);
  if (!store) {
    store = createResourceStore({
      resource: entry.resource,
      rows: prismaRows(entry.delegate, prisma),
      onChange: revalidateResource,
      currentUser,
    });
    stores.set(name, store);
  }
  return store;
}

/**
 * Every number the stats above a resource's table need, in one query.
 *
 * The total, how many arrived in the last week and the week before, and how many hold
 * each value of a status field — one grouped scan, summed up here. Written as SQL
 * because Prisma's aggregation API can't express "count these rows, and also count the
 * subset of them created since Tuesday" in a single round trip.
 *
 * The table and column names come from the descriptor, never from a request, and are
 * quoted; nothing a visitor types reaches this.
 */
export interface ResourceStats {
  total: number;
  /** Created in the last `days` days, and in the `days` before that. */
  current: number;
  previous: number;
  /** Rows per value of the grouped field, when one was asked for. */
  values: Record<string, number>;
}

export function resourceStats(name: string, field?: string, days = 7): Promise<ResourceStats> {
  const read = cached(
    async (resourceName: string, key: string | undefined, windowDays: number): Promise<ResourceStats> => {
      const entry = (resourceTables as unknown as Record<string, { resource: Resource } | undefined>)[resourceName];
      if (!entry) return { total: 0, current: 0, previous: 0, values: {} };

      const table = `"${entry.resource.table}"`;
      const grouped = key && entry.resource.fields[key] ? `"${columnName(key)}"` : undefined;
      const window = windowDays * 86_400_000;
      const since = new Date(Date.now() - window).toISOString();
      const before = new Date(Date.now() - window * 2).toISOString();

      const select = [
        "count(*)::int as total",
        `count(*) filter (where "created_at" >= '${since}')::int as current`,
        `count(*) filter (where "created_at" >= '${before}' and "created_at" < '${since}')::int as previous`,
        ...(grouped ? [`${grouped} as value`] : []),
      ].join(", ");
      const query = `select ${select} from ${table}${grouped ? ` group by ${grouped}` : ""}`;

      const rows = (await prisma.$queryRawUnsafe(query)) as { total: number; current: number; previous: number; value?: unknown }[];
      const stats: ResourceStats = { total: 0, current: 0, previous: 0, values: {} };
      for (const row of rows) {
        stats.total += Number(row.total ?? 0);
        stats.current += Number(row.current ?? 0);
        stats.previous += Number(row.previous ?? 0);
        if (grouped) stats.values[String(row.value ?? "")] = Number(row.total ?? 0);
      }
      return stats;
    },
    ["flare", "resource-stats"],
    { tags: [resourceTag(name)], revalidate: TTL.medium },
  );
  return read(name, field, days);
}

/** How many records a resource has. One field of {@link resourceStats}. */
export async function recordCount(name: string): Promise<number> {
  return (await resourceStats(name)).total;
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
