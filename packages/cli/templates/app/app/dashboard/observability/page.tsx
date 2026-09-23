import Link from "next/link";
import { ActivityIcon, AlertTriangleIcon, DatabaseIcon, GaugeIcon, HistoryIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCards, type Stat } from "@/components/dashboard/stat-card";
import { TrafficChart } from "@/components/dashboard/traffic-chart";
import { auditCount, recentAudit } from "@/lib/audit";
import { workerAnalytics } from "@/lib/analytics";
import { recordCount, requireDashboard, resourcePath, visibleResources } from "@/lib/dashboard";
import { site } from "@/lib/site";

export const metadata = { title: "Observability" };

const ACTION_TONE: Record<string, "secondary" | "destructive" | "outline"> = {
  create: "secondary",
  update: "outline",
  delete: "destructive",
  "bulk-delete": "destructive",
  import: "secondary",
};

const when = (date: Date) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);

/** How the app is behaving: traffic from Cloudflare, size from the database, and who changed what. */
export default async function ObservabilityPage() {
  await requireDashboard("/dashboard/observability");

  const [analytics, resources, changes, audit] = await Promise.all([
    workerAnalytics(site.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")),
    visibleResources(),
    auditCount(7),
    recentAudit(20),
  ]);

  const tables = await Promise.all(resources.map(async (resource) => ({ resource, total: await recordCount(resource.name) })));
  const records = tables.reduce((total, table) => total + table.total, 0);

  const stats: Stat[] = [
    analytics.ok
      ? { label: "Requests (7 days)", value: analytics.data.requests, icon: ActivityIcon }
      : { label: "Requests (7 days)", value: "—", hint: "not connected", icon: ActivityIcon },
    analytics.ok
      ? {
          label: "Errors",
          value: analytics.data.errors,
          hint: `${analytics.data.errorRate.toFixed(2)}% of requests`,
          goodDirection: "down",
          icon: AlertTriangleIcon,
        }
      : { label: "Errors", value: "—", hint: "not connected", icon: AlertTriangleIcon },
    analytics.ok
      ? { label: "Median CPU time", value: `${analytics.data.medianCpuMs} ms`, hint: "per request", icon: GaugeIcon }
      : { label: "Median CPU time", value: "—", hint: "not connected", icon: GaugeIcon },
    { label: "Changes this week", value: changes, hint: "creates, edits and deletes", icon: HistoryIcon },
  ];

  return (
    <>
      <PageHeader
        title="Observability"
        description="Traffic, database and the record of who changed what."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Observability" }]}
      />

      <StatCards stats={stats} />

      {!analytics.ok && (
        <Alert>
          <AlertTitle>{analytics.reason === "unconfigured" ? "Traffic isn't connected yet" : "Couldn't read traffic from Cloudflare"}</AlertTitle>
          <AlertDescription>
            <p>
              {analytics.message}
              {analytics.reason === "unconfigured" &&
                " Create a token with Account Analytics: Read, then set it with `wrangler secret put CLOUDFLARE_API_TOKEN` and `wrangler secret put CLOUDFLARE_ACCOUNT_ID`."}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {analytics.ok && analytics.data.points.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests a day</CardTitle>
            <CardDescription>The last seven days, errors marked in red.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrafficChart points={analytics.data.points} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseIcon className="size-4" />
              Database
            </CardTitle>
            <CardDescription>{records.toLocaleString()} records across {tables.length} {tables.length === 1 ? "table" : "tables"}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {tables.length === 0 && <p className="text-sm text-muted-foreground">No resources yet.</p>}
            {tables.map(({ resource, total }) => (
              <div key={resource.name} className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0 last:pb-0">
                <Link href={resourcePath(resource)} className="hover:underline">
                  {resource.pluralLabel}
                </Link>
                <span className="tabular-nums text-muted-foreground">{total.toLocaleString()}</span>
              </div>
            ))}
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
                        <TableCell className="text-right whitespace-nowrap text-muted-foreground tabular-nums">{when(entry.createdAt)}</TableCell>
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
