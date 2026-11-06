import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { enabledSocialProviders } from "@/lib/auth";
import { authConfig, signupOffered } from "@/lib/auth-config";
import { anyAccountExists } from "@/lib/user-titles";
import { getSession, safeRedirectPath } from "@/lib/session";
import { site } from "@/lib/site";
import { theme } from "@/lib/theme";

export const metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getSession()) redirect(next);

  // An app with sign-up closed does not offer a form that would be refused: the gate is
  // in lib/auth.ts, and this is only about not wasting somebody's time at it. The first
  // account is exempt there, so a brand-new app can still be set up — which is why this
  // checks whether anybody exists rather than only the setting.
  if (!signupOffered && (await anyAccountExists())) {
    return (
      <AuthShell page="sign-up" title="Sign-up is closed" subtitle={`${site.name} is not accepting new accounts.`} footer={null}>
        <p className="text-sm text-muted-foreground">
          If you should have an account, ask whoever runs {site.name} to make you one.{" "}
          <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="underline underline-offset-4">
            Sign in
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

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
