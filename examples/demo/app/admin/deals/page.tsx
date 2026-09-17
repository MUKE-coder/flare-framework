import { ResourceTable } from "@/components/admin/resource-table";
import type { SearchParams } from "@/components/admin/query";
import dealResource from "@/resources/deal.resource";

export default async function DealsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{dealResource.pluralLabel}</h1>
      <ResourceTable resource={dealResource} searchParams={await searchParams} />
    </div>
  );
}
