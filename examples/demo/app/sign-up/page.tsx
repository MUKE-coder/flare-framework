import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession, safeRedirectPath } from "@/lib/session";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next);
  if (await getSession()) redirect(next);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <AuthForm mode="sign-up" next={next} />
      <p className="text-sm text-[var(--foreground-muted)]">
        Already registered?{" "}
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-medium text-[var(--foreground)] underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
