import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { authConfig } from "@/lib/auth-config";
import { safeRedirectPath } from "@/lib/session";

export const metadata = { title: "Verify it's you" };

/** Reached after a correct password on an account with two-factor on (lib/auth-client.ts sends people here). */
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell
      title="Verify it's you"
      subtitle="Your account uses two-factor authentication."
      footer={
        <Link href="/sign-in" className="font-medium text-link hover:underline">
          Use a different account
        </Link>
      }
    >
      <TwoFactorForm methods={authConfig.twoFactor} next={safeRedirectPath(next)} />
    </AuthShell>
  );
}
