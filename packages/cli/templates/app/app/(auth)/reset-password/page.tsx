import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { FormMessage } from "@/components/auth/ui";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <AuthShell
      title="Choose a new password"
      footer={
        <Link href="/sign-in" className="font-medium text-link hover:underline">
          Back to sign in
        </Link>
      }
    >
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <FormMessage>This reset link has expired or was already used.</FormMessage>
          <Link href="/forgot-password" className="text-center text-sm font-medium text-link hover:underline">
            Ask for a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
