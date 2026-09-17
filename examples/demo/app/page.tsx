import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <p className="text-sm font-medium text-[var(--foreground-muted)]">Flare</p>
      <h1 className="text-2xl font-semibold">demo</h1>
      <p className="text-sm text-[var(--foreground-muted)]">
        Edit <code>app/page.tsx</code> to get started, or generate a resource with{" "}
        <code>flare gen resource</code>.
      </p>
      <nav className="flex gap-3 text-sm font-medium">
        <Link href="/sign-in" className="underline">Sign in</Link>
        <Link href="/sign-up" className="underline">Sign up</Link>
        <Link href="/dashboard" className="underline">Dashboard</Link>
      </nav>
    </main>
  );
}
