import { Profile } from "@/components/account/sections";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { user } = await requireSession("/dashboard/account");
  return (
    <Profile
      user={{
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        twoFactorEnabled: Boolean((user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled),
      }}
    />
  );
}
