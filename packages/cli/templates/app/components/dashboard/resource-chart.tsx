import { sql } from "drizzle-orm";
import type { Resource } from "@flaredev/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { resourceTables } from "@/resources/server";
import { cached, resourceTag, TTL } from "@/lib/cache";

export interface DayCount {
  /** "2026-09-23" */
  date: string;
  total: number;
}

/**
 * How many records were created a day, grouped in SQL rather than by reading rows: one
 * query over the created_at index, whatever the table's size.
 */
export function createdPerDay(name: string, days = 30): Promise<DayCount[]> {
  const counts = cached(
    async (resourceName: string, window: number) => {
      const entry = (resourceTables as unknown as Record<string, { table: unknown } | undefined>)[resourceName];
      const table = entry?.table as { createdAt?: unknown } | undefined;
      if (!table?.createdAt) return [];
      const since = new Date(Date.now() - window * 86_400_000);
      const rows = (await getDb()
        .select({
          date: sql<string>`strftime('%Y-%m-%d', ${table.createdAt} / 1000, 'unixepoch')`,
          total: sql<number>`count(*)`,
        })
        .from(table as never)
        .where(sql`${table.createdAt} >= ${since.getTime()}`)
        .groupBy(sql`1`)
        .orderBy(sql`1`)) as DayCount[];
      return rows;
    },
    ["flare", "created-per-day"],
    { tags: [resourceTag(name)], revalidate: TTL.short },
  );
  return counts(name, days);
}

/** Fill the gaps: a day with nothing created still needs a column. */
function series(rows: DayCount[], days: number): DayCount[] {
  const found = new Map(rows.map((row) => [row.date, row.total]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.now() - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date, total: found.get(date) ?? 0 };
  });
}

/**
 * New records a day for the last month, above the table.
 *
 * Drawn with CSS rather than a charting library: thirty numbers don't justify shipping
 * one to the browser, and this renders on the server with the rest of the page.
 */
export async function ResourceChart({ resource, days = 30 }: { resource: Resource; days?: number }) {
  const rows = series(await createdPerDay(resource.name, days), days);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  if (total === 0) return null;

  const peak = Math.max(1, ...rows.map((row) => row.total));
  const month = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New {resource.pluralLabel.toLowerCase()}</CardTitle>
        <CardDescription>
          {total.toLocaleString()} in the last {days} days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-28 items-end gap-0.5" role="img" aria-label={`New ${resource.pluralLabel.toLowerCase()} a day for the last ${days} days`}>
          {rows.map((row) => (
            <div
              key={row.date}
              title={`${row.date}: ${row.total}`}
              style={{ height: `${Math.max(2, Math.round((row.total / peak) * 100))}%` }}
              className="flex-1 rounded-t-sm bg-primary/70 transition-colors hover:bg-primary"
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{month.format(new Date(`${rows[0]!.date}T00:00:00Z`))}</span>
          <span>{month.format(new Date(`${rows[rows.length - 1]!.date}T00:00:00Z`))}</span>
        </div>
      </CardContent>
    </Card>
  );
}
