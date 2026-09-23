import Link from "next/link";
import { FileArchiveIcon, FileIcon, FileImageIcon, FileTextIcon, FileVideoIcon, FolderIcon, HardDriveIcon, MusicIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCards } from "@/components/dashboard/stat-card";
import { RelativeTime } from "@/components/dashboard/local-time";
import { ItemActions } from "./item-actions";
import { NewFolderButton } from "./new-folder";
import { Uploader } from "./uploader";
import { formatBytes } from "@/lib/bytes";
import { childFolders, drivePath, driveTotals, folderFiles, trail, type DriveFolder } from "@/lib/drive";

/** A file's icon, from what it is. */
function iconFor(contentType: string | null) {
  const type = contentType ?? "";
  if (type.startsWith("image/")) return FileImageIcon;
  if (type.startsWith("video/")) return FileVideoIcon;
  if (type.startsWith("audio/")) return MusicIcon;
  if (type === "application/pdf" || type.startsWith("text/")) return FileTextIcon;
  if (type.includes("zip") || type.includes("compressed") || type.includes("gzip")) return FileArchiveIcon;
  return FileIcon;
}

/**
 * One folder: where you are, what's in it, and somewhere to drop more.
 *
 * The root is the same view with no folder, which is why this takes `folder` rather than
 * an id — `null` means the top of the drive.
 */
export async function FolderView({ folder }: { folder: DriveFolder | null }) {
  const here = folder?.id ?? null;
  const [path, folders, files, totals] = await Promise.all([trail(here), childFolders(here), folderFiles(here), driveTotals()]);

  const crumbs = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Drive", href: path.length > 0 ? drivePath() : undefined },
    ...path.map((step, index) => ({
      label: step.name,
      href: index === path.length - 1 ? undefined : drivePath(step.id),
    })),
  ];

  const empty = folders.length === 0 && files.length === 0;

  return (
    <>
      <PageHeader
        title={folder?.name ?? "Drive"}
        description={folder ? undefined : "Everything you've put here."}
        crumbs={crumbs}
        actions={<NewFolderButton parentId={here} />}
      />

      <StatCards
        stats={[
          { label: "Files", value: totals.files, icon: FileIcon },
          { label: "Folders", value: totals.folders, icon: FolderIcon },
          { label: "Stored", value: formatBytes(totals.bytes), icon: HardDriveIcon },
        ]}
      />

      <Uploader folderId={here} />

      {empty ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>Drop a few files above, or make a folder to put them in.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {folders.map((child) => (
            <Card key={child.id} className="group">
              <CardContent className="flex items-center gap-3 py-3">
                <FolderIcon className="size-5 shrink-0 text-muted-foreground" />
                <Link href={drivePath(child.id)} className="flex min-w-0 flex-1 flex-col hover:underline">
                  <span className="truncate font-medium">{child.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Added <RelativeTime value={child.createdAt} />
                  </span>
                </Link>
                <ItemActions kind="Folder" id={child.id} name={child.name} folderId={here} />
              </CardContent>
            </Card>
          ))}

          {files.map((file) => {
            const Icon = iconFor(file.contentType);
            return (
              <Card key={file.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  <Icon className="size-5 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatBytes(file.size)} · <RelativeTime value={file.createdAt} />
                    </span>
                  </span>
                  <ItemActions kind="File" id={file.id} name={file.name} folderId={here} content={file.content} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
