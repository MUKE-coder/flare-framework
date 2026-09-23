import Link from "next/link";
import { ArrowRightIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: number | string;
  /** Under the number: "12 this week", "3 need attention". */
  hint?: string;
  /** Change against the previous period, as a percentage. Up isn't always good — see `goodDirection`. */
  change?: number;
  goodDirection?: "up" | "down";
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
}

const format = (value: number | string) => (typeof value === "number" ? value.toLocaleString() : value);

/** One number, what it means, and where to go for the detail behind it. */
export function StatCard({ label, value, hint, change, goodDirection = "up", icon: Icon, href }: Stat) {
  const rising = (change ?? 0) >= 0;
  const good = rising === (goodDirection === "up");
  const Trend = rising ? TrendingUpIcon : TrendingDownIcon;

  const card = (
    <Card className={cn("h-full gap-3", href && "transition-colors hover:border-primary/40")}>
      <CardHeader className="pb-0">
        <CardDescription className="flex items-center gap-2">
          {Icon && <Icon className="size-4" />}
          {label}
        </CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{format(value)}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {change !== undefined && (
            <span className={cn("inline-flex items-center gap-1 font-medium", good ? "text-success" : "text-danger")}>
              <Trend className="size-3.5" />
              {Math.abs(change).toFixed(change % 1 === 0 ? 0 : 1)}%
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
        {href && <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />}
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      {card}
    </Link>
  ) : (
    card
  );
}

/** A row of stats that wraps: four across on a desktop, two on a tablet, one on a phone. */
export function StatCards({ stats }: { stats: Stat[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
}
