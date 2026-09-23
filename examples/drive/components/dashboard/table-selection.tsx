"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteManyAction } from "@/app/dashboard/actions";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { toCsv } from "@/lib/csv";

interface SelectionValue {
  ids: string[];
  selected: Set<string>;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionValue | null>(null);

function useSelection(): SelectionValue {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("Selection components must be inside <TableSelection>.");
  return value;
}

/**
 * Selection for the rows on screen.
 *
 * Deliberately per page: a "select everything, all 40,000 of them" checkbox reads as
 * harmless right up until the moment it isn't. To act on more than a page, filter down
 * to what you mean first.
 */
export function TableSelection({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((current) => (current.size === ids.length ? new Set() : new Set(ids)));
  }, [ids]);

  const clear = useCallback(() => setSelected(new Set()), []);
  const value = useMemo(() => ({ ids, selected, toggle, toggleAll, clear }), [ids, selected, toggle, toggleAll, clear]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function SelectAllCheckbox({ label }: { label: string }) {
  const { ids, selected, toggleAll } = useSelection();
  const all = ids.length > 0 && selected.size === ids.length;
  return (
    <Checkbox
      checked={all ? true : selected.size > 0 ? "indeterminate" : false}
      onCheckedChange={toggleAll}
      aria-label={all ? `Clear selection` : `Select all ${label} on this page`}
    />
  );
}

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useSelection();
  return <Checkbox checked={selected.has(id)} onCheckedChange={() => toggle(id)} aria-label={`Select ${label}`} />;
}

/** Highlights the row while it's selected, so the checkbox isn't the only signal. */
export function useRowSelected(id: string): boolean {
  return useSelection().selected.has(id);
}

interface BarProps {
  resourceName: string;
  label: string;
  pluralLabel: string;
  canDelete: boolean;
  /** Rows as they're shown, for exporting what's selected without another round trip. */
  rows: Record<string, unknown>[];
  columns: { key: string; label: string }[];
}

/**
 * What you can do with the rows you've ticked. Appears only when something is selected,
 * pinned to the bottom so it's reachable in a long table.
 */
export function SelectionBar({ resourceName, label, pluralLabel, canDelete, rows, columns }: BarProps) {
  const { selected, clear } = useSelection();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const count = selected.size;
  if (count === 0) return null;

  const noun = count === 1 ? label.toLowerCase() : pluralLabel.toLowerCase();

  const exportSelected = () => {
    const chosen = rows.filter((row) => selected.has(String(row.id)));
    downloadCsv(`${resourceName.toLowerCase()}-selection.csv`, toCsv(chosen, columns));
  };

  const remove = () => {
    startTransition(async () => {
      const result = await deleteManyAction(resourceName, [...selected]);
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { deleted, failed } = result.data;
      clear();
      router.refresh();
      if (failed > 0) toast.warning(`Deleted ${deleted}; ${failed} couldn't be deleted.`);
      else toast.success(`Deleted ${deleted} ${deleted === 1 ? label.toLowerCase() : pluralLabel.toLowerCase()}.`);
    });
  };

  return (
    <>
      <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-2 rounded-full border bg-popover px-2 py-1.5 shadow-lg">
        <span className="px-2 text-sm tabular-nums">
          {count} {noun} selected
        </span>
        <Button variant="ghost" size="sm" onClick={exportSelected}>
          <DownloadIcon data-icon="inline-start" />
          Export
        </Button>
        {canDelete && (
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirming(true)}>
            <Trash2Icon data-icon="inline-start" />
            Delete
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={clear} aria-label="Clear selection">
          <XIcon />
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} {noun}?
            </AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone. Anything that belongs to them may be deleted too.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); remove(); }} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Delete {count}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Hand the browser a file without a round trip to the server. */
export function downloadCsv(filename: string, csv: string) {
  // The BOM is what makes Excel read UTF-8 correctly.
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
