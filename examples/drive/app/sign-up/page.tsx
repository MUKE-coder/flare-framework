import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { enabledSocialProviders } from "@/lib/auth";
import { authConfig } from "@/lib/auth-config";
import { getSession, safeRedirectPath } from "@/lib/session";
import { site } from "@/lib/site";
import { theme } from "@/lib/theme";

export const metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getSession()) redirect(next);

  const copy = theme.signUp(site.name);
  return (
    <AuthShell
      page="sign-up"
      title={copy.title}
      subtitle={(copy as { subtitle?: string }).subtitle}
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-medium text-link hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm
        providers={enabledSocialProviders()}
        socialPlacement={theme.social}
        socialStyle={theme.socialStyle}
        next={next}
        verifyFirst={authConfig.requireEmailVerification}
      />
    </AuthShell>
  );
}
