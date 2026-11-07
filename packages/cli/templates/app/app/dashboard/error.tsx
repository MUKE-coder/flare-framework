"use client";

import { useEffect } from "react";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { hardReload, isStaleChunkError } from "@/lib/stale-chunk";

/**
 * A dashboard page that threw.
 *
 * Inside the layout, so the sidebar stays and `reset` retries just this page — no
 * sign-out, no lost place in the app.
 *
 * Except when the tab is running stale JavaScript, where `reset` re-renders the same
 * stale modules and can only fail again. That case gets a reload instead, which is the
 * thing that actually works. See lib/stale-chunk.ts.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const stale = isStaleChunkError(error);

  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>{stale ? "This tab is running old code" : "This page didn't load"}</EmptyTitle>
        <EmptyDescription>
          {stale ? (
            "Nothing is wrong with the app. This tab loaded one build and the server is serving another — usually after an update, or after starting a different app on this port. Reloading fixes it."
          ) : (
            <>
              Something went wrong fetching it.
              {error.digest && <> Reference: <span className="font-mono select-all">{error.digest}</span>.</>}
            </>
          )}
        </EmptyDescription>
      </EmptyHeader>
      <Button onClick={stale ? hardReload : reset}>
        <RefreshCwIcon data-icon="inline-start" />
        {stale ? "Reload the page" : "Try again"}
      </Button>
    </Empty>
  );
}
