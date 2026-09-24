import { ConnectedAccounts, Passkeys, TwoFactor } from "@/components/account/sections";
import { prisma } from "@/lib/db";
import { enabledSocialProviders } from "@/lib/auth";
import { authConfig, twoFactorAvailable } from "@/lib/auth-config";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Security" };

/** Two-factor, passkeys and the accounts you can sign in with. */
export default async function SecurityPage() {
  const { user } = await requireSession("/dashboard/account/security");
  const credential = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true },
  });
  const providers = enabledSocialProviders();

  return (
    <>
      {twoFactorAvailable && (
        <TwoFactor
          enabled={Boolean((user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled)}
          hasPassword={Boolean(credential)}
          methods={authConfig.twoFactor}
        />
      )}
      {authConfig.passkeys && <Passkeys />}
      {providers.length > 0 && <ConnectedAccounts providers={providers} />}
    </>
  );
}
