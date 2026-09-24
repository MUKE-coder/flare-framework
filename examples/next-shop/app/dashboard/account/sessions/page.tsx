import { Sessions } from "@/components/account/sections";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Devices" };

export default async function SessionsPage() {
  await requireSession("/dashboard/account/sessions");
  return <Sessions />;
}
