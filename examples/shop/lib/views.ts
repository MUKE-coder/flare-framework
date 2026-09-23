import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { savedView } from "@/db/flare-schema";
import { dashboardSession } from "./dashboard";

export interface SavedView {
  id: string;
  resource: string;
  name: string;
  query: string;
}

/** How many views one person may keep per resource, so the sidebar stays a sidebar. */
export const MAX_VIEWS = 12;

/** This person's saved views, oldest first so the sidebar doesn't reshuffle. */
export async function listViews(resource?: string): Promise<SavedView[]> {
  const { session } = await dashboardSession();
  if (!session) return [];
  const where = resource
    ? and(eq(savedView.userId, session.user.id), eq(savedView.resource, resource))
    : eq(savedView.userId, session.user.id);
  const rows = await getDb()
    .select({ id: savedView.id, resource: savedView.resource, name: savedView.name, query: savedView.query })
    .from(savedView)
    .where(where)
    .orderBy(asc(savedView.createdAt));
  return rows;
}
