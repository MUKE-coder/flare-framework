import { ResourceTable } from "@/components/admin/resource-table";
import type { SearchParams } from "@/components/admin/query";
import contactResource from "@/resources/contact.resource";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{contactResource.pluralLabel}</h1>
      <ResourceTable resource={contactResource} searchParams={await searchParams} />
    </div>
  );
}
