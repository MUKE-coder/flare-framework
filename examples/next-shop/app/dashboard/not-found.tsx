import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata = { title: "Not found" };

/**
 * A missing record or page inside the dashboard.
 *
 * Keeps the sidebar and header, because someone who followed a stale link to a
 * deleted record is still signed in and still working — dropping them on the public
 * 404 would throw away that context.
 */
export default function DashboardNotFound() {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>Not found</EmptyTitle>
        <EmptyDescription>This page or record doesn&apos;t exist. It may have been deleted.</EmptyDescription>
      </EmptyHeader>
      <Button asChild>
        <Link href="/dashboard">Back to the dashboard</Link>
      </Button>
    </Empty>
  );
}
