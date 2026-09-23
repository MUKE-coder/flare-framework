"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createFolderAction } from "@/app/dashboard/drive/actions";

/** New folder, here. */
export function NewFolderButton({ parentId }: { parentId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await createFolderAction(name, parentId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      setName("");
      toast.success(`Created ${String(result.data.name)}`);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderPlusIcon data-icon="inline-start" />
          New folder
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="folder-name">Name</FieldLabel>
            <Input
              id="folder-name"
              value={name}
              autoFocus
              placeholder="Invoices"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && name.trim() && create()}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={pending || !name.trim()}>
            {pending && <Spinner data-icon="inline-start" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
