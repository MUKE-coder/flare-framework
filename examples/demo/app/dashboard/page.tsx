import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { ArrowRightIcon, CheckCircle2Icon, CircleIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/dashboard/page-header";
import { resourceIcon } from "@/components/dashboard/resource-icon";
import { StatCards, type Stat } from "@/components/dashboard/stat-card";
import { getDb } from "@/db";
import { passkey } from "@/db/auth-schema";
import { authConfig, twoFactorAvailable } from "@/lib/auth-config";
import { adminPermissions, recentCounts, recordCount, resourcePath, trend, visibleResources } from "@/lib/dashboard";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Dashboard" };

/** The first thing you see when you sign in: how much data there is, and what's left to set up. */
export default async function DashboardPage() {
  const { user } = await requireSession("/dashboard");
  const resources = await visibleResources();

  const cards = await Promise.all(
    resources.map(async (resource) => {
      const [total, recent, permissions] = await Promise.all([
        recordCount(resource.name),
        recentCounts(resource.name),
        adminPermissions(resource.name),
      ]);
      return { resource, total, recent, permissions };
    }),
  );

  const stats: Stat[] = cards.slice(0, 4).map(({ resource, total, recent }) => ({
    label: resource.pluralLabel,
    value: total,
    hint: recent.current > 0 ? `${recent.current.toLocaleString()} this week` : "none this week",
    change: trend(recent.current, recent.previous),
    icon: resourceIcon(resource.icon),
    href: resourcePath(resource),
  }));

  const [{ passkeys } = { passkeys: 0 }] = await getDb().select({ passkeys: count() }).from(passkey).where(eq(passkey.userId, user.id));
  const twoFactorOn = Boolean((user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled);
  const steps = [
    { done: user.emailVerified, label: "Verify your email address", href: "/verify-email" },
    ...(twoFactorAvailable ? [{ done: twoFactorOn, label: "Turn on two-factor authentication", href: "/dashboard/account/security" }] : []),
    ...(authConfig.passkeys ? [{ done: passkeys > 0, label: "Add a passkey for one-tap sign-in", href: "/dashboard/account/security" }] : []),
  ];
  const remaining = steps.filter((step) => !step.done).length;

  return (
    <>
      <PageHeader
        title={`Welcome${user.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description={resources.length > 0 ? "Everything in your app, and how it's moving." : "Your app is running. Add a resource to fill this page."}
      />

      <StatCards stats={stats} />

      {resources.length === 0 && (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No resources yet</EmptyTitle>
            <EmptyDescription>
              Generate one with <code>flare gen resource Contact --fields &quot;name:string, email:string&quot;</code>, then fill it with{" "}
              <code>flare seed:resource Contact --count 1000</code>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {cards.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your data</CardTitle>
              <CardDescription>Every resource you can see.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              {cards.map(({ resource, total, permissions }) => {
                const Icon = resourceIcon(resource.icon);
                return (
                  <div key={resource.name} className="flex items-center gap-3 border-b py-3 last:border-b-0 last:pb-0">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="size-4.5" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <Link href={resourcePath(resource)} className="truncate text-sm font-medium hover:underline">
                        {resource.pluralLabel}
                      </Link>
                      <span className="text-xs text-muted-foreground">{total.toLocaleString()} records</span>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      {permissions.create && (
                        <Button variant="ghost" size="icon" aria-label={`New ${resource.label.toLowerCase()}`} asChild>
                          <Link href={resourcePath(resource, "new")}>
                            <PlusIcon />
                          </Link>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label={`Open ${resource.pluralLabel.toLowerCase()}`} asChild>
                        <Link href={resourcePath(resource)}>
                          <ArrowRightIcon />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Secure your account</CardTitle>
            <CardDescription>{remaining === 0 ? "All done." : `${remaining} to go.`}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {steps.map((step) => (
              <Link key={step.label} href={step.href} className="flex items-center gap-3 border-b py-3 text-sm last:border-b-0 last:pb-0 hover:text-primary">
                {step.done ? <CheckCircle2Icon className="size-4.5 text-success" /> : <CircleIcon className="size-4.5 text-muted-foreground" />}
                <span className={step.done ? "text-muted-foreground line-through" : "font-medium"}>{step.label}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
