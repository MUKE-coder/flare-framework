"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { compact, estimate, PER_VIEW, usd } from "@/lib/costs";
import { groupDigits, ungroup } from "@/lib/number";

/**
 * What a month would cost at a traffic level you choose.
 *
 * The arithmetic is in lib/costs.ts along with the per-view assumptions it rests on.
 * This is a model, not a bill — the app can see what it stores, not what it served.
 */
export function CostEstimator({ storedGb }: { storedGb: { d1: number; r2: number } }) {
  const [views, setViews] = useState("50000");
  const monthly = Math.max(0, Number(views) || 0);
  const result = useMemo(() => estimate(monthly, storedGb), [monthly, storedGb]);

  const rows = [
    { label: "Requests", value: compact(result.requests), of: "10M included" },
    { label: "D1 rows read", value: compact(result.d1RowsRead), of: "25B included" },
    { label: "D1 rows written", value: compact(result.d1RowsWritten), of: "50M included" },
    { label: "KV reads", value: compact(result.kvReads), of: "10M included" },
    { label: "KV writes", value: compact(result.kvWrites), of: "1M included" },
    { label: "CPU", value: `${compact(result.cpuMs)} ms`, of: "30M ms included" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Field className="max-w-xs">
        <FieldLabel htmlFor="views">Page views a month</FieldLabel>
        <Input
          id="views"
          inputMode="numeric"
          className="tabular-nums"
          value={groupDigits(views)}
          onChange={(event) => setViews(ungroup(event.target.value, false))}
        />
        <FieldDescription>
          At {PER_VIEW.d1RowsRead} rows read and {PER_VIEW.cpuMs} ms of CPU per view.
        </FieldDescription>
      </Field>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm text-muted-foreground">Estimated monthly cost</span>
            <span className="text-3xl font-semibold tabular-nums">{usd(result.totalUsd)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {result.overageUsd < 0.005
              ? "All of it the $5 Workers Paid subscription — this traffic is inside every included allowance."
              : `$5 subscription plus ${usd(result.overageUsd)} of usage past what's included.`}
          </p>

          <div className="grid gap-x-6 gap-y-2 border-t pt-3 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="tabular-nums">
                  {row.value} <span className="text-xs text-muted-foreground">/ {row.of}</span>
                </span>
              </div>
            ))}
          </div>

          <p className="border-t pt-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Free plan: </span>
            {result.freePlanVerdict}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
