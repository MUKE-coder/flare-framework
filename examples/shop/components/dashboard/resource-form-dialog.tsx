"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import type { ClientResource } from "@flaredev/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { RelationMeta } from "./fields/field-widget";
import { ResourceForm } from "./resource-form";

export type FormRelations = Record<string, RelationMeta & { initialTitle?: string }>;

interface Props {
  resource: ClientResource;
  relations: FormRelations;
  listHref: string;
  mode: "create" | "edit";
  /** Edit: the record and its id. */
  id?: string;
  record?: Record<string, unknown> | null;
  /** Controlled use (a row menu opens it); otherwise pass `trigger`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

/**
 * The create/edit form in a dialog, so adding a record doesn't lose the list, its
 * filters or the place in it. Apps that would rather have a page set
 * `site.dashboard.forms` to "page" (lib/site.ts) and get the same form full width.
 */
export function ResourceFormDialog({ resource, relations, listHref, mode, id, record, open, onOpenChange, trigger }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const noun = resource.label.toLowerCase();

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? `New ${noun}` : `Edit ${noun}`}</DialogTitle>
          <DialogDescription>{mode === "create" ? `Fill this in and it appears in the list.` : "Changes save straight away."}</DialogDescription>
        </DialogHeader>
        {/* Remounting on open clears whatever was typed and abandoned last time. */}
        {isOpen && (
          <ResourceForm
            key={`${mode}-${id ?? "new"}`}
            resource={resource}
            mode={mode}
            id={id}
            record={record}
            relations={relations}
            listHref={listHref}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The list page's "New …" button, when forms open in a dialog. */
export function NewRecordButton({ resource, relations, listHref }: { resource: ClientResource; relations: FormRelations; listHref: string }) {
  return (
    <ResourceFormDialog
      resource={resource}
      relations={relations}
      listHref={listHref}
      mode="create"
      trigger={
        <Button>
          <PlusIcon data-icon="inline-start" />
          New {resource.label.toLowerCase()}
        </Button>
      }
    />
  );
}
