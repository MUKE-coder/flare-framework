import { DatabaseIcon, FilesIcon, HardDriveIcon, LayersIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CostEstimator } from "@/components/dashboard/cost-estimator";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCards } from "@/components/dashboard/stat-card";
import { compact, FREE, gb } from "@/lib/costs";
import { requireDashboard, resourceStats, visibleResources } from "@/lib/dashboard";
import { storedBytes } from "@/lib/usage";

export const metadata = { title: "Costs" };

/**
 * What this app holds, and what it would cost to run.
 *
 * Two halves, and the difference between them matters. The top is measured: rows this
 * app has stored, files it has put in R2. The bottom is modelled, because a Worker can
 * see what it wrote but not how many requests it served — that lives in Cloudflare's
 * analytics, behind an API token this app doesn't hold and shouldn't need.
 */
export default async function CostsPage() {
  await requireDashboard("/dashboard/costs");
  const resources = await visibleResources();

  const [counts, stored] = await Promise.all([
    Promise.all(resources.map(async (resource) => ({ resource, total: (await resourceStats(resource.name)).total }))),
    storedBytes(),
  ]);

  const rows = counts.reduce((sum, entry) => sum + entry.total, 0);
  const r2Gb = stored.bytes / 1024 ** 3;

  return (
    <>
      <PageHeader
        title="Costs"
        description="What this app holds, and what it would cost to run."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Costs" }]}
      />

      <StatCards
        stats={[
          { label: "Rows stored", value: compact(rows), icon: DatabaseIcon, hint: `across ${resources.length} resources` },
          { label: "Files in R2", value: compact(stored.files), icon: FilesIcon },
          { label: "File storage", value: gb(r2Gb), icon: HardDriveIcon, hint: `${FREE.r2StorageGb} GB free` },
          { label: "Resources", value: resources.length, icon: LayersIcon },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>What's in the database</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                <TableHead className="text-right">Rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {counts.map(({ resource, total }) => (
                <TableRow key={resource.name}>
                  <TableCell>{resource.pluralLabel}</TableCell>
                  <TableCell className="text-right tabular-nums">{total.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CostEstimator storedGb={{ d1: 0, r2: r2Gb }} />

      <Alert>
        <AlertTitle>This is an estimate, not a bill</AlertTitle>
        <AlertDescription>
          A Worker can see what it stored; it can't see how many requests it served or how many rows it read. Those are in{" "}
          <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" className="underline">
            your Cloudflare dashboard
          </a>
          . The assumptions behind the numbers above are in <code>lib/costs.ts</code>, and the reasoning is in the{" "}
          <a href="https://flare-docs.codetotech.com/guides/costs/" target="_blank" rel="noreferrer" className="underline">
            cost guide
          </a>
          .
        </AlertDescription>
      </Alert>
    </>
  );
}
