import Link from "next/link";
import { DatabaseIcon, HistoryIcon, KeyRoundIcon, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { LocalTime } from "@/components/dashboard/local-time";
import { StatCards, type Stat } from "@/components/dashboard/stat-card";
import { auditCount, recentAudit } from "@/lib/audit";
import { recordCount, requireArea, resourcePath, visibleResources } from "@/lib/dashboard";
import { prisma } from "@/lib/db";

export const metadata = { title: "Observability" };

const ACTION_TONE: Record<string, "secondary" | "destructive" | "outline"> = {
  create: "secondary",
  update: "outline",
  delete: "destructive",
  "bulk-delete": "destructive",
  import: "secondary",
};

/**
 * How the app is behaving, from what this app can actually see: the database, the
 * accounts and the record of who changed what.
 *
 * Request traffic, errors and latency are Vercel's to measure — they happen at their
 * edge, before a byte reaches this code — so the page links there rather than printing
 * three dashes and calling them "not connected".
 */
export default async function ObservabilityPage() {
  await requireArea("@observability");

  const [resources, changes, audit, people, sessions] = await Promise.all([
    visibleResources(),
    auditCount(7),
    recentAudit(20),
    prisma.user.count(),
    prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
  ]);

  const tables = await Promise.all(resources.map(async (resource) => ({ resource, total: await recordCount(resource.name) })));
  const records = tables.reduce((total, table) => total + table.total, 0);

  const stats: Stat[] = [
    { label: "Users", value: people, icon: UsersIcon, href: "/dashboard/users" },
    // Users are records too — the hint counts their table, so the number must as well.
    { label: "Records", value: records + people, hint: `across ${tables.length + 1} ${tables.length === 0 ? "table" : "tables"}`, icon: DatabaseIcon },
    { label: "Signed-in sessions", value: sessions, hint: "not yet expired", icon: KeyRoundIcon },
    { label: "Changes this week", value: changes, hint: "creates, edits and deletes", icon: HistoryIcon },
  ];

  return (
    <>
      <PageHeader
        title="Observability"
        description="The database, the accounts, and the record of who changed what."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Observability" }]}
      />

      <StatCards stats={stats} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseIcon className="size-4" />
              Database
            </CardTitle>
            <CardDescription>What each table holds right now.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0 last:pb-0">
              <Link href="/dashboard/users" className="hover:underline">
                Users
              </Link>
              <span className="tabular-nums text-muted-foreground">{people.toLocaleString()}</span>
            </div>
            {tables.map(({ resource, total }) => (
              <div key={resource.name} className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0 last:pb-0">
                <Link href={resourcePath(resource)} className="hover:underline">
                  {resource.pluralLabel}
                </Link>
                <span className="tabular-nums text-muted-foreground">{total.toLocaleString()}</span>
              </div>
            ))}
            <p className="mt-4 text-xs text-muted-foreground">
              Request traffic, errors and latency happen at Vercel&apos;s edge before they reach this code, so they live in{" "}
              <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                your Vercel dashboard
              </a>{" "}
              under Observability.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HistoryIcon className="size-4" />
              Recent changes
            </CardTitle>
            <CardDescription>Every write through the dashboard, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Nothing yet</EmptyTitle>
                  <EmptyDescription>Creates, edits, deletes and imports show up here as they happen.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>What</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead className="text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Badge variant={ACTION_TONE[entry.action] ?? "secondary"}>{entry.action}</Badge>
                          <span className="ml-2 text-muted-foreground">{entry.resource}</span>
                        </TableCell>
                        <TableCell className="max-w-56 truncate">{entry.recordLabel ?? describeBulk(entry.changes)}</TableCell>
                        <TableCell className="max-w-48 truncate text-muted-foreground">{entry.userEmail ?? "—"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap text-muted-foreground tabular-nums">
                          <LocalTime value={entry.createdAt} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** Bulk actions have no single record, so say how many they touched. */
function describeBulk(changes: Record<string, unknown> | null): string {
  if (!changes) return "—";
  if (typeof changes.deleted === "number") return `${changes.deleted} deleted`;
  if (typeof changes.created === "number") return `${changes.created} imported`;
  return "—";
}
