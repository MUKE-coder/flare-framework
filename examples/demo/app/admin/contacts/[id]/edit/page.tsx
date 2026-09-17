import { ResourceFormPage } from "@/components/admin/resource-form-page";
import contactResource from "@/resources/contact.resource";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  return <ResourceFormPage resource={contactResource} id={(await params).id} />;
}
