import { can, type Policy } from "@flaredev/core";
import type { Authorize } from "@flaredev/core/server";
import { policies } from "@/policies";
import { auth } from "./auth";

/**
 * Authorization for every generated resource API (`app/api/<resource>/...`).
 * Return a Response to deny the request; return nothing to allow it.
 *
 * A signed-in user is required. Beyond that, a resource's policy decides
 * (`flare gen policy <Resource> --roles admin,staff`); resources without a policy
 * are open to any signed-in user. The admin UI reads the same policies, so the two
 * never drift apart.
 */
export const authorize: Authorize = async ({ request, resource, action }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });

  const role = (session.user as { role?: string | null }).role ?? null;
  const policy = (policies as Record<string, Policy | undefined>)[resource.name];
  if (!can(policy, role, action)) {
    return Response.json({ error: `Your role can't ${action} ${resource.pluralLabel.toLowerCase()}.` }, { status: 403 });
  }
};
