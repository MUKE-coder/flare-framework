"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { ClientResource } from "@flaredev/core";
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
import { Spinner } from "@/components/ui/spinner";
import { ResourceFormDialog, type FormRelations } from "./resource-form-dialog";

interface Props {
  resource: ClientResource;
  id: string;
  record: Record<string, unknown>;
  relations: FormRelations;
  listHref: string;
  editHref: string;
  canUpdate: boolean;
  canDelete: boolean;
  /** Whether editing opens a dialog (site.dashboard.forms) or goes to the form page. */
  modalForms: boolean;
}

/** Edit and delete, at the top of a record's own page. Deleting goes back to the list. */
export function RecordActions({ resource, id, record, relations, listHref, editHref, canUpdate, canDelete, modalForms }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      const result = await deleteRecordAction(resource.name, id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${resource.label} deleted.`);
      // The record this page is about is gone, so the list is the only place left to be.
      router.push(listHref);
      router.refresh();
    });
  };

  return (
    <>
      {canUpdate &&
        (modalForms ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href={editHref}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Link>
          </Button>
        ))}
      {canDelete && (
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirming(true)}>
          <Trash2Icon data-icon="inline-start" />
          Delete
        </Button>
      )}

      {canUpdate && modalForms && (
        <ResourceFormDialog
          resource={resource}
          relations={relations}
          listHref={listHref}
          mode="edit"
          id={id}
          record={record}
          open={editing}
          onOpenChange={(open) => {
            setEditing(open);
            if (!open) router.refresh();
          }}
        />
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {resource.label.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone. Anything that belongs to it may be deleted too.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
