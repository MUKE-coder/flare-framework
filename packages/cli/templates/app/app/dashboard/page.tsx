import { SignOutButton } from "@/components/sign-out-button";
import { requireSession } from "@/lib/session";

export default async function DashboardPage() {
  const { user } = await requireSession("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-[var(--foreground-muted)]">
        Signed in as <span className="font-medium text-[var(--foreground)]">{user.email}</span>
      </p>
    </main>
  );
}
