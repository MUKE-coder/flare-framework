import type { Metadata } from "next";
import { RealtimeBoard } from "@/components/admin/realtime-board";
import { requireAdmin } from "@/lib/admin";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Realtime" };

export default async function RealtimePage() {
  await requireAdmin();
  const session = await getSession();
  const email = session?.user.email ?? "viewer@example.com";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Realtime</h1>
        <p className="text-sm text-muted-foreground">
          A live deal board backed by Flare&apos;s Durable Object channel primitive. Open this page in two tabs: members
          appear in presence, activity and broadcasts are shared instantly, and either tab can push server-driven
          events.
        </p>
      </div>
      <RealtimeBoard email={email} />
    </div>
  );
}