"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExternalLinkIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { Resource } from "@flaredev/core";
import { deleteRecordAction } from "@/app/dashboard/actions";
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
import { ResourceFormDialog, type FormRelations } from "./resource-form-dialog";

/**
 * Edit and delete for one row. Edit opens a dialog when the row's record came with it
 * (site.dashboard.forms is "modal"), and otherwise goes to the form page.
 */
export function RowActions({
  resource,
  id,
  record,
  relations = {},
  listHref,
  editHref,
  detailHref,
  canUpdate = true,
  canDelete = true,
}: {
  resource: Resource;
  id: string;
  /** The record itself, when the form opens in a dialog. */
  record?: Record<string, unknown>;
  relations?: FormRelations;
  listHref: string;
  editHref: string;
  /** The record's own page. */
  detailHref: string;
  canUpdate?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { name: resourceName, label } = resource;

  function onDelete() {
    startTransition(async () => {
      const result = await deleteRecordAction(resourceName, id);
      if (result.ok) {
        toast.success(`${label} deleted.`);
        setConfirming(false);
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
          {canUpdate && (
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
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {record && canUpdate && (
        <ResourceFormDialog
          resource={resource}
          relations={relations}
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
            <AlertDialogTitle>Delete this {label.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
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
