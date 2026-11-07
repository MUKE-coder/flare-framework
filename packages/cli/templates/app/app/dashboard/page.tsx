import Link from "next/link";
import { count, eq, gte } from "drizzle-orm";
import { ArrowRightIcon, CheckCircle2Icon, CircleIcon, PlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { resourceIcon } from "@/components/dashboard/resource-icon";
import { StatCards, type Stat } from "@/components/dashboard/stat-card";
import { getDb } from "@/db";
import { passkey, user as userTable } from "@/db/auth-schema";
import { authConfig, twoFactorAvailable } from "@/lib/auth-config";
import { ADMIN_ROLES, adminPermissions, dashboardSession, resourcePath, resourceStats, trend, visibleResources } from "@/lib/dashboard";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Dashboard" };

/** The three commands that turn an empty app into one with data, with the stack's real steps. */
const FIRST_RESOURCE_STEPS = [
  { command: "npx flare gen resource Contact --fields 'name:string, email:email!'", note: "the table, API and admin screens" },
  { command: "npx flare migrate", note: "create its table" },
  { command: "npx flare seed:resource Contact 1000", note: "fill it with sample rows" },
];

/** The first thing you see when you sign in: how much data there is, and what's left to set up. */
export default async function DashboardPage() {
  const { user } = await requireSession("/dashboard");
  const { role } = await dashboardSession();
  const isAdmin = role !== null && ADMIN_ROLES.includes(role);
  const resources = await visibleResources();
  const week = new Date(Date.now() - 7 * 86_400_000);

  const cards = await Promise.all(
    resources.map(async (resource) => {
      // One query per resource for the count and the trend, not two.
      const [stats, permissions] = await Promise.all([resourceStats(resource.name), adminPermissions(resource.name)]);
      return { resource, total: stats.total, recent: stats, permissions };
    }),
  );

  // The one table every app has from its first sign-in. Admin only, because it links to
  // the accounts page, which is.
  const db = getDb();
  const [people, peopleThisWeek] = isAdmin
    ? await Promise.all([
        db
          .select({ n: count() })
          .from(userTable)
          .then(([row]) => row?.n ?? 0),
        db
          .select({ n: count() })
          .from(userTable)
          .where(gte(userTable.createdAt, week))
          .then(([row]) => row?.n ?? 0),
      ])
    : [0, 0];

  const stats: Stat[] = [
    ...(isAdmin
      ? [
          {
            label: "Users",
            value: people,
            hint: peopleThisWeek > 0 ? `${peopleThisWeek.toLocaleString()} this week` : "none this week",
            icon: UsersIcon,
            href: "/dashboard/users",
          } satisfies Stat,
        ]
      : []),
    ...cards.slice(0, isAdmin ? 3 : 4).map(({ resource, total, recent }) => ({
      label: resource.pluralLabel,
      value: total,
      hint: recent.current > 0 ? `${recent.current.toLocaleString()} this week` : "none this week",
      change: trend(recent.current, recent.previous),
      icon: resourceIcon(resource.icon),
      href: resourcePath(resource),
    })),
  ];

  const [{ passkeys } = { passkeys: 0 }] = await db.select({ passkeys: count() }).from(passkey).where(eq(passkey.userId, user.id));
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
        description={resources.length > 0 ? "Everything in your app, and how it's moving." : "Your app is running. Add a resource and this page fills in."}
      />

      <StatCards stats={stats} />

      {resources.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add your first resource</CardTitle>
            <CardDescription>
              A resource is a table, its API and its admin screens, generated from one line. Three commands from a terminal in this
              app:
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {FIRST_RESOURCE_STEPS.map((step, index) => (
              <div key={step.command} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-3 last:border-b-0 last:pb-0">
                <span className="grid size-6 shrink-0 translate-y-0.5 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-[13px]">{step.command}</code>
                <span className="text-xs text-muted-foreground">{step.note}</span>
              </div>
            ))}
            <p className="mt-4 text-xs text-muted-foreground">
              Then refresh this page: the sidebar, these cards and the admin screens are already wired to it.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {(cards.length > 0 || isAdmin) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your data</CardTitle>
              <CardDescription>Every table in the app, and who it belongs to.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              {isAdmin && (
                <div className="flex items-center gap-3 border-b py-3 last:border-b-0 last:pb-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                    <UsersIcon className="size-4.5" />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <Link href="/dashboard/users" className="truncate text-sm font-medium hover:underline">
                      Users
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {people.toLocaleString()} {people === 1 ? "account" : "accounts"}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="Open users" asChild>
                      <Link href="/dashboard/users">
                        <ArrowRightIcon />
                      </Link>
                    </Button>
                  </div>
                </div>
              )}
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
