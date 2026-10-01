"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExternalLinkIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon, Undo2Icon as UndoIcon } from "lucide-react";
import { toast } from "sonner";
import type { ClientResource } from "@flaredev/core";
import { deleteRecordAction, restoreRecordAction } from "@/app/dashboard/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { ResourceFormSheet, type FormRelations } from "./resource-form-sheet";

/**
 * Edit and delete for one row. Edit opens a dialog when the row's record came with it
 * (site.dashboard.forms is "sheet"), and otherwise goes to the form page.
 */
export function RowActions({
  resource,
  id,
  record,
  relations = {},
  omit,
  listHref,
  editHref,
  detailHref,
  canUpdate = true,
  canDelete = true,
  inTrash = false,
}: {
  resource: ClientResource;
  id: string;
  /** The record itself, when the form opens in a dialog. */
  record?: Record<string, unknown>;
  relations?: FormRelations;
  /** Fields the edit form leaves out — see ResourceForm. */
  omit?: string[];
  listHref: string;
  editHref: string;
  /** The record's own page. */
  detailHref: string;
  canUpdate?: boolean;
  canDelete?: boolean;
  /** Viewing the trash of a softDelete resource: restore and empty, not edit and delete. */
  inTrash?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { name: resourceName, label } = resource;

  function onDelete() {
    startTransition(async () => {
      // In the trash, Delete means for good — there is nowhere further to move it.
      const result = await deleteRecordAction(resourceName, id, { force: inTrash });
      if (result.ok) {
        toast.success(inTrash ? `${label} deleted for good.` : `${label} moved to the trash.`);
        setConfirming(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onRestore() {
    startTransition(async () => {
      const result = await restoreRecordAction(resourceName, id);
      if (result.ok) {
        toast.success(`${label} restored.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }



  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Row actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={detailHref}>
                <ExternalLinkIcon />
                Open
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {canUpdate && inTrash && (
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={onRestore}>
                <UndoIcon />
                Restore
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
          {canUpdate && !inTrash && (
            <DropdownMenuGroup>
              {record ? (
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <PencilIcon />
                  Edit
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild>
                  <Link href={editHref}>
                    <PencilIcon />
                    Edit
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          )}
          {canUpdate && canDelete && <DropdownMenuSeparator />}
          {canDelete && (
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
                <Trash2Icon />
                {inTrash ? "Delete forever" : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {record && canUpdate && (
        <ResourceFormSheet
          resource={resource}
          relations={relations}
          omit={omit}
          listHref={listHref}
          mode="edit"
          id={id}
          record={record}
          open={editing}
          onOpenChange={setEditing}
        />
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {inTrash ? `Delete this ${label.toLowerCase()} for good?` : `Delete this ${label.toLowerCase()}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {inTrash
                ? "The record and its uploaded files are removed. This cannot be undone."
                : "It moves to the trash, where you can restore it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
