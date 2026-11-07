import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-forms";

export const metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to choose a new one."
      footer={
        <Link href="/sign-in" className="font-medium text-link hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm initialEmail={email ?? ""} />
    </AuthShell>
  );
}
