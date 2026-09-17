import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession, safeRedirectPath } from "@/lib/session";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <AuthForm mode="sign-in" next={next} />
      <p className="text-sm text-[var(--foreground-muted)]">
        No account?{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-medium text-[var(--foreground)] underline">
          Create one
        </Link>
      </p>
    </main>
  );
}
