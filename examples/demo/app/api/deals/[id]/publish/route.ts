import { authorize, currentUser } from "@/lib/api";
import { dashboardStore } from "@/lib/dashboard";
import dealResource from "@/resources/deal.resource";

/**
 * POST /api/deals/[id]/publish
 *
 * Yours to change. The session and the policy are checked the same way the generated
 * CRUD routes check them, and `store` is the same store they use — so hooks, validation
 * and cache invalidation all still apply.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await authorize({ request, resource: dealResource, action: "update" });
  if (denied) return denied;

  const user = await currentUser();
  const store = dashboardStore("Deal");
  const body = (await request.json()) as Record<string, unknown>;

  // Your logic here. `store.list`, `store.get`, `store.create`, `store.update` and
  // `store.delete` are available, or reach for Drizzle directly with `getDb()`.
  return Response.json({ ok: true, id, received: body, user: user?.email ?? null });
}
