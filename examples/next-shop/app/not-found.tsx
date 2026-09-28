import Link from "next/link";
import { ArrowLeftIcon, SearchXIcon } from "lucide-react";
import { SiteHeader } from "@/components/marketing/site-header";

export const metadata = { title: "Page not found" };

/**
 * The public 404.
 *
 * Shown for any address that doesn't match a route, so it keeps the site's chrome:
 * someone who mistyped a URL should still be able to get where they were going,
 * which is why the two ways out are a link home and a link to sign in rather than
 * an apology.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-6 px-6 py-20 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-surface">
          <SearchXIcon className="size-6 text-foreground-muted" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-3">
          <p className="font-mono text-sm tracking-widest text-foreground-muted">404</p>
          <h1 className="text-3xl text-balance md:text-4xl">This page doesn&apos;t exist</h1>
          <p className="text-foreground-muted text-pretty">
            The link may be out of date, or the address may have a typo in it.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-[var(--button-radius)] bg-brand px-5 font-medium text-brand-foreground [background-image:var(--brand-gradient,none)] hover:brightness-95"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            Back home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center rounded-[var(--button-radius)] border border-border px-5 font-medium hover:bg-accent"
          >
            Go to the dashboard
          </Link>
        </div>
      </main>
    </>
  );
}
