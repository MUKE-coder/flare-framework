import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { getDb } from "@/db";
import { passkey } from "@/db/auth-schema";
import { authConfig, twoFactorAvailable } from "@/lib/auth-config";
import { requireSession } from "@/lib/session";
import { site } from "@/lib/site";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user } = await requireSession("/dashboard");
  const [{ passkeys } = { passkeys: 0 }] = await getDb().select({ passkeys: count() }).from(passkey).where(eq(passkey.userId, user.id));
  const twoFactorOn = Boolean((user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled);

  const steps = [
    { done: user.emailVerified, label: "Verify your email address", href: "/dashboard/account#profile" },
    ...(twoFactorAvailable ? [{ done: twoFactorOn, label: "Turn on two-factor authentication", href: "/dashboard/account#two-factor" }] : []),
    ...(authConfig.passkeys ? [{ done: passkeys > 0, label: "Add a passkey for one-tap sign-in", href: "/dashboard/account#passkeys" }] : []),
  ];
  const remaining = steps.filter((step) => !step.done).length;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
        <p className="text-foreground-muted">This is your {site.name} dashboard.</p>
      </div>

      <section aria-labelledby="security" className="rounded-[calc(var(--radius)+4px)] border border-border bg-surface">
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 id="security" className="text-base">
            Secure your account
          </h2>
          <span className="text-sm text-foreground-muted">{remaining === 0 ? "All done" : `${remaining} to go`}</span>
        </div>
        <ul>
          {steps.map((step) => (
            <li key={step.label} className="border-b border-border last:border-b-0">
              <Link href={step.href} className="flex items-center gap-3 px-6 py-4 text-sm hover:bg-surface-muted">
                {step.done ? <CheckCircle2Icon className="size-5 text-success" /> : <CircleIcon className="size-5 text-foreground-muted" />}
                <span className={step.done ? "text-foreground-muted line-through" : "font-medium"}>{step.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
