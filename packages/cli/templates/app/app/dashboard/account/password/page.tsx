import { and, eq } from "drizzle-orm";
import { Password } from "@/components/account/sections";
import { getDb } from "@/db";
import { account } from "@/db/auth-schema";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Password" };

/** Whether this person signs in with a password at all: social and passkey accounts have none. */
async function hasPassword(userId: string) {
  const credential = await getDb()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .get();
  return Boolean(credential);
}

export default async function PasswordPage() {
  const { user } = await requireSession("/dashboard/account/password");
  return <Password hasPassword={await hasPassword(user.id)} email={user.email} />;
}
