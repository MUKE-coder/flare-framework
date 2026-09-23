"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookmarkPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { saveViewAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Keep this search, these filters, this sort and these columns as a named view.
 *
 * Only offered once the table is actually filtered — saving "all of them" as a view is
 * saving the list you're already on.
 */
export function SaveViewButton({ resourceName, label }: { resourceName: string; label: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const query = new URLSearchParams(params.toString());
  query.delete("page");
  query.delete("cursor");
  if ([...query.keys()].length === 0) return null;

  const save = () => {
    startTransition(async () => {
      const result = await saveViewAction(resourceName, name, query.toString());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      setName("");
      toast.success(`Saved "${name.trim()}" to the sidebar.`);
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="outline" size="icon" aria-label="Save this view" onClick={() => setOpen(true)}>
        <BookmarkPlusIcon />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>It appears under {label.toLowerCase()} in the sidebar, for you.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="view-name">Name</FieldLabel>
            <Input
              id="view-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Overdue invoices"
              maxLength={60}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) save();
              }}
            />
            <FieldDescription>Keeps the search, filters, sorting and columns you have now.</FieldDescription>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !name.trim()}>
              {pending && <Spinner data-icon="inline-start" />}
              Save view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
