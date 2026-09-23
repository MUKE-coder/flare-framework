"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createReadUrlAction } from "@/app/dashboard/actions";
import { deleteFileAction, deleteFolderAction, renameAction } from "@/app/dashboard/drive/actions";

interface Props {
  kind: "Folder" | "File";
  id: string;
  name: string;
  /** The folder this thing sits in, so the right page is refreshed. */
  folderId: string | null;
  /** For a file: the storage key to download. */
  content?: string;
}

/** Download, rename, delete — for one folder or one file. */
export function ItemActions({ kind, id, name, folderId, content }: Props) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, startTransition] = useTransition();

  const download = () =>
    startTransition(async () => {
      const result = await createReadUrlAction("File", "content", content!, name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // A signed URL is a one-off; opening it is the download.
      window.location.href = result.data.url;
    });

  const rename = () =>
    startTransition(async () => {
      const result = await renameAction(kind, id, draft);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRenaming(false);
      toast.success(`Renamed to ${draft.trim()}`);
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      const result = kind === "File" ? await deleteFileAction(id, folderId) : await deleteFolderAction(id, folderId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConfirming(false);
      toast.success(
        kind === "File"
          ? `Deleted ${name}`
          : `Deleted ${name} and ${(result.data as { files: number }).files} file(s) inside it`,
      );
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${name}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {kind === "File" && (
              <DropdownMenuItem onSelect={download}>
                <DownloadIcon />
                Download
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                setDraft(name);
                setRenaming(true);
              }}
            >
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {kind.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`rename-${id}`}>Name</FieldLabel>
              <Input
                id={`rename-${id}`}
                value={draft}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && rename()}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button onClick={rename} disabled={pending || !draft.trim()}>
              {pending && <Spinner data-icon="inline-start" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "Folder"
                ? "Everything inside this folder goes with it, including the files themselves. This can't be undone."
                : "The file and its contents are removed. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
