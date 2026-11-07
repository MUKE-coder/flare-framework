import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { authConfig } from "@/lib/auth-config";
import { getSession, safeRedirectPath } from "@/lib/session";

export const metadata = { title: "Verify your email" };

/**
 * Confirm an email address: by the code in the message, or by asking for a fresh link
 * when the one they have has expired.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string; next?: string }> }) {
  const { email, next } = await searchParams;
  const session = await getSession();
  const to = safeRedirectPath(next, "/dashboard/account");
  if (session?.user.emailVerified) redirect(to);

  return (
    <AuthShell
      title="Verify your email"
      subtitle="One step, so we know we can reach you."
      footer={
        <Link href={session ? "/dashboard" : "/sign-in"} className="font-medium text-link hover:underline">
          {session ? "Back to the dashboard" : "Back to sign in"}
        </Link>
      }
    >
      <VerifyEmailForm initialEmail={session?.user.email ?? email ?? ""} codes={authConfig.emailOtp} next={to} />
    </AuthShell>
  );
}
