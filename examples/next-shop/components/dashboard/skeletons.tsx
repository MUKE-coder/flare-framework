import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The shapes pages take while their data is on its way.
 *
 * Each one is the layout it stands in for, drawn empty — the same header, the same
 * number of columns, cards the same size. That is the whole point: a skeleton that
 * matches keeps the page still when the content lands, where a spinner throws
 * everything into place at once and makes the wait feel like a jump.
 *
 * They are built from the same tokens as the real thing, so they follow the theme
 * without knowing which theme it is.
 */

/** One line of text. `w` is a Tailwind width, so a heading and a caption differ. */
function Line({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4 w-40", className)} />;
}

/** Title, description and the buttons on the right — matches PageHeader. */
export function PageHeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Line className="h-3 w-20" />
        <Line className="h-3 w-24" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Line className="w-64" />
        </div>
        {actions > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: actions }, (_, index) => (
              <Skeleton key={index} className="h-9 w-28 rounded-[var(--button-radius)]" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The row of counts above a resource table. */
export function StatsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-4">
          <Line className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Line className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A chart card. The bars vary so it reads as a chart rather than a block. */
export function ChartSkeleton({ className }: { className?: string }) {
  const bars = [45, 70, 35, 85, 55, 75, 40, 65, 50, 80, 60, 45];
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <Line className="h-3 w-32" />
      <div className="mt-4 flex h-32 items-end gap-2" aria-hidden="true">
        {bars.map((height, index) => (
          <Skeleton key={index} className="flex-1 rounded-sm" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

/** The toolbar and rows of a resource table. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full max-w-xs rounded-[var(--button-radius)]" />
        <Skeleton className="h-9 w-24 rounded-[var(--button-radius)]" />
        <Skeleton className="h-9 w-24 rounded-[var(--button-radius)]" />
        <Skeleton className="ml-auto h-9 w-20 rounded-[var(--button-radius)]" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-3">
          {Array.from({ length: columns }, (_, index) => (
            <Line key={index} className={cn("h-3", index === 0 ? "w-32" : "w-20")} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
            {Array.from({ length: columns }, (_, column) => (
              <Line key={column} className={cn("h-4", column === 0 ? "w-32" : "w-20")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A form: fields in a column, buttons at the end. */
export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Line className="h-3 w-24" />
          <Skeleton className="h-9 w-full rounded-[var(--button-radius)]" />
        </div>
      ))}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-[var(--button-radius)]" />
        <Skeleton className="h-9 w-20 rounded-[var(--button-radius)]" />
      </div>
    </div>
  );
}

/** One record: its fields as label/value pairs. */
export function DetailSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-8">
          <Line className="h-3 w-28 shrink-0" />
          <Line className="h-4 w-48" />
        </div>
      ))}
    </div>
  );
}

/** The whole of a resource's list page, for its `loading.tsx`. */
export function ResourceListSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <>
      <PageHeaderSkeleton />
      <StatsSkeleton />
      <ChartSkeleton />
      <TableSkeleton columns={columns} />
    </>
  );
}
