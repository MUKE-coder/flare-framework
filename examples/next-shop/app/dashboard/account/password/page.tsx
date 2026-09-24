import { Password } from "@/components/account/sections";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Password" };

/** Whether this person signs in with a password at all: social and passkey accounts have none. */
async function hasPassword(userId: string) {
  const credential = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });
  return Boolean(credential);
}

export default async function PasswordPage() {
  const { user } = await requireSession("/dashboard/account/password");
  return <Password hasPassword={await hasPassword(user.id)} email={user.email} />;
}
