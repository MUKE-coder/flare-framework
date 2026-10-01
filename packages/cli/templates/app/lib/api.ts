import { headers } from "next/headers";
import { can, type Policy } from "@flaredev/core";
import type { Authorize } from "@/lib/resource/handlers";
import { policies } from "@/policies";
import { auth } from "./auth";

/**
 * Who is making this request, for a resource's hooks (`hooks.beforeCreate` and friends
 * in the descriptor). Reads the session the same way everything else does.
 */
export async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, email } = session.user;
  return { id, email, role: (session.user as { role?: string | null }).role ?? null };
}

/**
 * A resource's policy, or undefined when it has none.
 *
 * Routes pass this to `createResourceStore` as well as to `authorize`, because the two
 * halves of a policy are enforced in different places: the role check is a 403 before
 * anything is read, and `own` is a restriction on which rows exist as far as this user
 * is concerned, which only the store can apply.
 */
export function policyFor(resourceName: string): Policy | undefined {
  return (policies as Record<string, Policy | undefined>)[resourceName];
}

/**
 * Authorization for every generated resource API (`app/api/<resource>/...`).
 * Return a Response to deny the request; return nothing to allow it.
 *
 * A signed-in user is required. Beyond that, a resource's policy decides
 * (`flare gen policy <Resource> --roles admin,staff`); resources without a policy
 * are open to any signed-in user. The admin UI reads the same policies, so the two
 * never drift apart.
 *
 * This is the role half only. A policy with `own` also restricts which rows each user
 * sees, and that is enforced by the store — see `policyFor`.
 */
export const authorize: Authorize = async ({ request, resource, action }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });

  const role = (session.user as { role?: string | null }).role ?? null;
  if (!can(policyFor(resource.name), role, action)) {
    return Response.json({ error: `Your role can't ${action} ${resource.pluralLabel.toLowerCase()}.` }, { status: 403 });
  }
};
