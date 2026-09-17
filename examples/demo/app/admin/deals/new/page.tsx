import { ResourceFormPage } from "@/components/admin/resource-form-page";
import dealResource from "@/resources/deal.resource";

export default function NewDealPage() {
  return <ResourceFormPage resource={dealResource} />;
}
