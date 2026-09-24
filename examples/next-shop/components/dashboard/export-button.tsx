"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { exportRecordsAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { downloadCsv } from "./table-selection";

/**
 * Exports what the table is showing — the same search, filters and sort, not just the
 * page on screen. The server builds the CSV because the browser only ever holds one page.
 */
export function ExportButton({ resourceName, pluralLabel }: { resourceName: string; pluralLabel: string }) {
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const query = new URLSearchParams(params.toString());
      query.delete("page");
      const result = await exportRecordsAction(resourceName, query.toString());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { csv, rows, truncated } = result.data;
      downloadCsv(`${resourceName.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      if (truncated) toast.warning(`Exported the first ${rows.toLocaleString()} ${pluralLabel.toLowerCase()}. Filter down for the rest.`);
      else toast.success(`Exported ${rows.toLocaleString()} ${pluralLabel.toLowerCase()}.`);
    });

  return (
    <Button variant="outline" onClick={run} disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
      Export
    </Button>
  );
}
