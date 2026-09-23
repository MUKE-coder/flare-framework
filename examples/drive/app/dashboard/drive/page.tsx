import { FolderView } from "@/components/drive/folder-view";
import { requireDashboard } from "@/lib/dashboard";

export const metadata = { title: "Drive" };

/** The top of the drive: everything that isn't inside a folder. */
export default async function DrivePage() {
  await requireDashboard("/dashboard/drive");
  return <FolderView folder={null} />;
}
