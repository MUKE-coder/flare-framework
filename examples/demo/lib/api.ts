import type { Authorize } from "@flare/core/server";
import { auth } from "./auth";

/**
 * Authorization for every generated resource API (`app/api/<resource>/...`).
 * Return a Response to deny the request; return nothing to allow it.
 *
 * Default: any signed-in user may list, read, create, update and delete.
 * Tighten it per resource and action, e.g.
 *
 *   if (resource.name === "Invoice" && action === "delete") {
 *     return Response.json({ error: "Forbidden." }, { status: 403 });
 *   }
 */
export const authorize: Authorize = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
};
