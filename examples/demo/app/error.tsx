"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

/**
 * The public error boundary.
 *
 * Reached when a page throws. It is a client component because it has to be — React
 * needs somewhere to hand `reset`, which re-renders the segment without a full page
 * load, and that is usually all a transient failure needs.
 *
 * `error.digest` is the only detail shown. The message itself is deliberately not:
 * in production it is replaced by React anyway, and in development the overlay is
 * more use than anything printed here.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The browser console in development; whatever collects console output in production.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-surface">
        <TriangleAlertIcon className="size-6 text-danger" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl text-balance md:text-4xl">Something went wrong</h1>
        <p className="text-foreground-muted text-pretty">
          This one is on us. Trying again often works; if it doesn&apos;t, the error has been logged.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-foreground-muted">
            Reference: <span className="select-all">{error.digest}</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--button-radius)] bg-brand px-5 font-medium text-brand-foreground [background-image:var(--brand-gradient,none)] hover:brightness-95"
        >
          <RefreshCwIcon className="size-4" aria-hidden="true" />
          Try again
        </button>
        <Link href="/" className="inline-flex h-11 items-center rounded-[var(--button-radius)] border border-border px-5 font-medium hover:bg-accent">
          Back home
        </Link>
      </div>
    </main>
  );
}
