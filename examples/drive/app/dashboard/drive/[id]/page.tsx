import { notFound } from "next/navigation";
import { FolderView } from "@/components/drive/folder-view";
import { getFolder } from "@/lib/drive";
import { requireDashboard } from "@/lib/dashboard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const folder = await getFolder((await params).id);
  return { title: folder?.name ?? "Drive" };
}

/** Inside one folder. */
export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireDashboard(`/dashboard/drive/${id}`);
  const folder = await getFolder(id);
  if (!folder) notFound();
  return <FolderView folder={folder} />;
}
