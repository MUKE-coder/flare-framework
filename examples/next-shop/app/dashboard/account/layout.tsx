import { AccountNav } from "@/components/account/account-nav";
import { PageHeader } from "@/components/dashboard/page-header";
import { twoFactorAvailable, authConfig } from "@/lib/auth-config";
import { enabledSocialProviders } from "@/lib/auth";
import { requireSession } from "@/lib/session";

/** The frame the account's pages share: one header, one set of links. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireSession("/dashboard/account");
  const security = twoFactorAvailable || authConfig.passkeys || enabledSocialProviders().length > 0;

  return (
    <>
      <PageHeader
        title="Account"
        description="Your profile, how you sign in, and where you're signed in."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Account" }]}
      />
      <AccountNav
        links={[
          { href: "/dashboard/account", label: "Profile" },
          { href: "/dashboard/account/password", label: "Password" },
          ...(security ? [{ href: "/dashboard/account/security", label: "Security" }] : []),
          { href: "/dashboard/account/sessions", label: "Devices" },
        ]}
      />
      <div className="flex max-w-3xl flex-col gap-6">{children}</div>
    </>
  );
}
