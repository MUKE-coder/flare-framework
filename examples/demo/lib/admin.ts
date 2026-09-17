import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Resource } from "@flare/core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { createResourceStore, type ResourceStore } from "@flare/core/server";
import { getDb } from "@/db";
import { resourceTables } from "@/resources/server";
import { auth } from "./auth";

/** Roles allowed into /admin. Grant one with `flare user:role you@example.com admin`. */
export const ADMIN_ROLES = ["admin", "staff"];

export async function adminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { session: null, allowed: false } as const;
  const role = (session.user as { role?: string | null }).role ?? "";
  return { session, allowed: ADMIN_ROLES.includes(role) } as const;
}

/** For admin pages: redirects signed-out visitors to sign-in and other roles to the home page. */
export async function requireAdmin(returnTo = "/admin") {
  const { session, allowed } = await adminSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  if (!allowed) redirect("/?error=forbidden");
  return session;
}

const stores = new Map<string, ResourceStore>();

/** CRUD store for a resource by name (404 for unknown names). */
export function adminStore(name: string): ResourceStore {
  const entry = (resourceTables as unknown as Record<string, { resource: Resource; table: SQLiteTable } | undefined>)[name];
  if (!entry) notFound();
  let store = stores.get(name);
  if (!store) {
    store = createResourceStore({ resource: entry.resource, table: entry.table, getDb });
    stores.set(name, store);
  }
  return store;
}

/** Every resource descriptor, for navigation and relation metadata. */
export function adminResources(): Resource[] {
  return Object.values(resourceTables as unknown as Record<string, { resource: Resource }>).map((entry) => entry.resource);
}

export function adminPath(resource: Resource, ...parts: string[]) {
  return ["/admin", resource.slug, ...parts].join("/");
}
