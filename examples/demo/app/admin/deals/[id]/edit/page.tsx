import { ResourceFormPage } from "@/components/admin/resource-form-page";
import dealResource from "@/resources/deal.resource";

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  return <ResourceFormPage resource={dealResource} id={(await params).id} />;
}
