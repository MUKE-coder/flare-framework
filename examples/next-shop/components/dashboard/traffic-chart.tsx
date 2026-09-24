import type { RequestPoint } from "@/lib/analytics";

/**
 * Requests a day, with the failing share in red.
 *
 * Bars in CSS rather than a charting library: seven numbers don't justify shipping one
 * to the browser, and this renders on the server with the rest of the page.
 */
export function TrafficChart({ points }: { points: RequestPoint[] }) {
  const peak = Math.max(1, ...points.map((point) => point.requests));
  const day = new Intl.DateTimeFormat(undefined, { weekday: "short" });

  return (
    <div className="flex items-end gap-2" role="img" aria-label={`Requests a day for the last ${points.length} days`}>
      {points.map((point) => {
        const height = Math.max(2, Math.round((point.requests / peak) * 100));
        const errorShare = point.requests > 0 ? (point.errors / point.requests) * 100 : 0;
        return (
          <div key={point.date} className="flex flex-1 flex-col items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">{point.requests.toLocaleString()}</span>
            <div className="flex h-32 w-full items-end" title={`${point.date}: ${point.requests.toLocaleString()} requests, ${point.errors.toLocaleString()} errors`}>
              <div className="relative w-full overflow-hidden rounded-t-md bg-primary/80" style={{ height: `${height}%` }}>
                {errorShare > 0 && <div className="absolute inset-x-0 bottom-0 bg-destructive" style={{ height: `${Math.max(4, errorShare)}%` }} />}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{day.format(new Date(`${point.date}T00:00:00Z`))}</span>
          </div>
        );
      })}
    </div>
  );
}
