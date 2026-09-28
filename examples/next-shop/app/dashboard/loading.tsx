import { PageHeaderSkeleton, StatsSkeleton, ChartSkeleton, TableSkeleton } from "@/components/dashboard/skeletons";

/**
 * The dashboard while its data loads.
 *
 * The sidebar and header are in the layout, so they stay put and only this part is
 * drawn empty — which is the whole benefit of putting the frame in a layout.
 */
export default function DashboardLoading() {
  return (
    <>
      <PageHeaderSkeleton actions={0} />
      <StatsSkeleton />
      <ChartSkeleton />
      <TableSkeleton rows={5} />
    </>
  );
}
