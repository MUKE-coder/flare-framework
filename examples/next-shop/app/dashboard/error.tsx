"use client";

import { useEffect } from "react";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/**
 * A dashboard page that threw.
 *
 * Inside the layout, so the sidebar stays and `reset` retries just this page — no
 * sign-out, no lost place in the app.
 */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>This page didn&apos;t load</EmptyTitle>
        <EmptyDescription>
          Something went wrong fetching it.
          {error.digest && <> Reference: <span className="font-mono select-all">{error.digest}</span>.</>}
        </EmptyDescription>
      </EmptyHeader>
      <Button onClick={reset}>
        <RefreshCwIcon data-icon="inline-start" />
        Try again
      </Button>
    </Empty>
  );
}
