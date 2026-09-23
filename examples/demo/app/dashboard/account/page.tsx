import { and, eq } from "drizzle-orm";
import { SecuritySettings } from "@/components/account/security-settings";
import { PageHeader } from "@/components/dashboard/page-header";
import { getDb } from "@/db";
import { account } from "@/db/auth-schema";
import { enabledSocialProviders } from "@/lib/auth";
import { authConfig } from "@/lib/auth-config";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const { user } = await requireSession("/dashboard/account");
  const credential = await getDb()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, user.id), eq(account.providerId, "credential")))
    .get();

  return (
    <>
      <PageHeader
        title="Account"
        description="Your profile, how you sign in, and where you're signed in."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Account" }]}
      />
      <SecuritySettings
        user={{
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          twoFactorEnabled: Boolean((user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled),
        }}
        hasPassword={Boolean(credential)}
        methods={{ passkeys: authConfig.passkeys, twoFactor: authConfig.twoFactor }}
        socialProviders={enabledSocialProviders()}
      />
    </>
  );
}
