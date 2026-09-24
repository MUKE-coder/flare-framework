"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import type { ClientResource } from "@flaredev/core";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
 * The create/edit form in a sheet, so adding a record doesn't lose the list, its filters
 * or the place in it.
 *
 * A sheet rather than a centred dialog: a form is a column of fields, and a panel down
 * the side of the screen has room for them without the page underneath jumping about or
 * the fields being squeezed into a box. Apps that would rather have a page set
 * `site.dashboard.forms` to "page" (lib/site.ts) and get the same form full width.
 */
export function ResourceFormSheet({ resource, relations, listHref, mode, id, record, open, onOpenChange, trigger }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const noun = resource.label.toLowerCase();

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{mode === "create" ? `New ${noun}` : `Edit ${noun}`}</SheetTitle>
          <SheetDescription>{mode === "create" ? "Fill this in and it appears in the list." : "Changes save straight away."}</SheetDescription>
        </SheetHeader>
        {/* Remounting on open clears whatever was typed and abandoned last time. */}
        {isOpen && (
          <div className="flex min-h-0 flex-1 flex-col p-4">
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
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** The list's "New …" button, with the sheet it opens. */
export function NewRecordButton({ resource, relations, listHref }: { resource: ClientResource; relations: FormRelations; listHref: string }) {
  return (
    <ResourceFormSheet
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
