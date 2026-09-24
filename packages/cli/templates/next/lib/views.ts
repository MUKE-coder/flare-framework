import { prisma } from "@/lib/db";
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
  return prisma.savedView.findMany({
    where: { userId: session.user.id, ...(resource ? { resource } : {}) },
    select: { id: true, resource: true, name: true, query: true },
    orderBy: { createdAt: "asc" },
  });
}
