import { openApiDocument } from "@flaredev/core/server";
import { apiDocs } from "@/lib/api-docs";
import { auth } from "@/lib/auth";
import { policies } from "@/policies";
import { resources } from "@/resources";

/** The OpenAPI 3.1 document for this app's REST API, as the current viewer may use it. */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  const role = session ? ((session.user as { role?: string | null }).role ?? "") : null;
  const document = openApiDocument({
    resources,
    policies,
    role,
    visibility: apiDocs.visibility,
    title: apiDocs.title,
    version: apiDocs.version,
    description: apiDocs.description,
    serverUrl: new URL(request.url).origin,
  });
  // Depends on who is asking: never share it through a cache.
  return Response.json(document, { headers: { "cache-control": "private, no-store" } });
}
