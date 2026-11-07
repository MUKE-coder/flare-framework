import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInFlow } from "@/components/auth/sign-in-flow";
import { enabledSocialProviders } from "@/lib/auth";
import { authConfig } from "@/lib/auth-config";
import { getSession, safeRedirectPath } from "@/lib/session";
import { site } from "@/lib/site";
import { theme } from "@/lib/theme";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  oauth: "Sign-in with that provider didn't finish. Try again.",
  link: "That sign-in link has expired or was already used. Ask for a new one.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reset?: string }> }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getSession()) redirect(next);

  const copy = theme.signIn(site.name);
  return (
    <AuthShell
      page="sign-in"
      title={copy.title}
      subtitle={(copy as { subtitle?: string }).subtitle}
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-medium text-link hover:underline">
            Sign up
          </Link>
        </>
      }
    >
      <SignInFlow
        providers={enabledSocialProviders()}
        socialPlacement={theme.social}
        socialStyle={theme.socialStyle}
        methods={{ magicLink: authConfig.magicLink, emailOtp: authConfig.emailOtp, passkeys: authConfig.passkeys }}
        next={next}
        initialError={params.error ? (ERRORS[params.error] ?? "Sign-in didn't finish. Try again.") : null}
        initialNotice={params.reset ? "Your password is changed. Sign in with the new one." : null}
      />
    </AuthShell>
  );
}
