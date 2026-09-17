import { ResourceFormPage } from "@/components/admin/resource-form-page";
import contactResource from "@/resources/contact.resource";

export default function NewContactPage() {
  return <ResourceFormPage resource={contactResource} />;
}
