"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition, type ClipboardEvent, type KeyboardEvent } from "react";
import { PlusIcon, RowsIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import {
  createValidators,
  issuesByField,
  optionLabel,
  storedFields,
  type ClientResource,
  type FileField as FileFieldDef,
  type StoredField,
} from "@flaredev/core";
import { importRecordsAction } from "@/app/dashboard/import-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { toValue } from "./cell-value";
import { FileField } from "./fields/file-field";

/**
 * Adding many records at once, as a spreadsheet.
 *
 * The form is right for one record and wrong for forty: it asks for a save per record,
 * it scrolls, and it cannot be pasted into. People who have forty records already have
 * them in Excel, so this is a grid they can paste into, tab across, and submit once.
 *
 * Three things it does not do, deliberately. It does not define its own validation —
 * the cells are checked against the same validators the form and the API use, so a row
 * that passes here cannot fail there for a different reason. It does not write records
 * itself — it hands rows to `importRecordsAction`, which is the same path the CSV
 * import takes, so hooks, policies and ownership all apply. And it does not coerce text
 * its own way: {@link toValue} is shared with the import, so "yes", "1" and "Lead" mean
 * the same in both.
 */

const BLANK_ROWS = 8;
/** Matches the per-batch cap in import-actions.ts; the sheet stops you before the server does. */
const MAX_ROWS = 500;

type Row = Record<string, string>;

interface CellError {
  row: number;
  field: string;
  message: string;
}

/**
 * Every stored column.
 *
 * File columns included: a clipboard cannot carry files, so they stay empty on a paste
 * and are attached per row afterwards — which is the real flow anyway, since the text
 * came from a spreadsheet and the files came from a folder.
 */
function bulkColumns(resource: ClientResource): [string, StoredField & { label: string }][] {
  return storedFields(resource);
}

/** A short hint under the column name, so the grid says what it will accept. */
function columnHint(def: StoredField & { label: string }): string {
  switch (def.kind) {
    case "boolean":
      return "yes / no";
    case "enum":
      return def.options.slice(0, 3).map((option) => optionLabel(def, option)).join(" · ") + (def.options.length > 3 ? " …" : "");
    case "multiselect":
    case "tags":
      return "separate with ;";
    case "date":
      return "YYYY-MM-DD";
    case "file":
      return "attach per row";
    case "json":
      return "JSON";
    case "int":
    case "float":
      return "number";
    default:
      return def.required ? "required" : "";
  }
}

export function BulkAddSheet({ resource, label }: { resource: ClientResource; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: BLANK_ROWS }, () => ({})));
  const [errors, setErrors] = useState<CellError[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const gridRef = useRef<HTMLTableSectionElement>(null);

  const columns = useMemo(() => bulkColumns(resource), [resource]);
  const validators = useMemo(() => createValidators(resource), [resource]);

  const errorAt = useCallback(
    (row: number, field: string) => errors.find((issue) => issue.row === row && issue.field === field)?.message,
    [errors],
  );

  const setCell = (row: number, key: string, value: string) => {
    setRows((current) => {
      const next = current.slice();
      next[row] = { ...next[row], [key]: value };
      return next;
    });
    // Clear this cell's error as soon as it is touched; re-checked on submit.
    setErrors((current) => current.filter((issue) => !(issue.row === row && issue.field === key)));
  };

  const addRows = (count: number) => setRows((current) => [...current, ...Array.from({ length: count }, () => ({}) as Row)]);
  const removeRow = (row: number) => {
    setRows((current) => (current.length === 1 ? [{}] : current.filter((_, index) => index !== row)));
    setErrors((current) => current.filter((issue) => issue.row !== row));
  };

  /** A row with nothing in it is not a record; it is the empty space under your data. */
  const filled = (row: Row) => Object.values(row).some((value) => value.trim() !== "");

  /**
   * Paste from a spreadsheet.
   *
   * Excel and Sheets put tab-separated rows on the clipboard, so a block pasted into a
   * cell fills from that cell down and right, growing the grid if it needs to. Pasting
   * a single value falls through to the browser's own handling.
   */
  const paste = (event: ClipboardEvent<HTMLInputElement>, row: number, column: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();

    const grid = text
      .replace(/\r\n/g, "\n")
      .replace(/\n+$/, "")
      .split("\n")
      .map((line) => line.split("\t"));

    setRows((current) => {
      const next = current.slice();
      while (next.length < row + grid.length) next.push({});
      grid.forEach((cells, rowOffset) => {
        const target = { ...next[row + rowOffset] };
        cells.forEach((cell, columnOffset) => {
          const key = columns[column + columnOffset]?.[0];
          if (key) target[key] = cell;
        });
        next[row + rowOffset] = target;
      });
      return next.slice(0, MAX_ROWS);
    });
    setErrors([]);
    toast.success(`Pasted ${grid.length} ${grid.length === 1 ? "row" : "rows"}.`);
  };

  /** Enter moves down a row, which is what a spreadsheet does. Tab is the browser's. */
  const navigate = (event: KeyboardEvent<HTMLInputElement>, row: number, column: number) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const selector = `[data-cell="${row + 1}-${column}"]`;
    const below = gridRef.current?.querySelector<HTMLInputElement>(selector);
    if (below) below.focus();
    else {
      addRows(1);
      // The row does not exist until React has rendered it.
      requestAnimationFrame(() => gridRef.current?.querySelector<HTMLInputElement>(selector)?.focus());
    }
  };

  const submit = () => {
    const candidates = rows.map((row, index) => ({ row, index })).filter((entry) => filled(entry.row));
    if (candidates.length === 0) {
      toast.error("Nothing to add — the grid is empty.");
      return;
    }

    // Checked here against the same validators the form and the API use, so a row that
    // passes this grid cannot fail later for a reason this grid could have told you.
    const found: CellError[] = [];
    const payload: Record<string, unknown>[] = [];
    for (const { row, index } of candidates) {
      const values: Record<string, unknown> = {};
      for (const [key, def] of columns) {
        const value = toValue(def, row[key] ?? "");
        if (value !== undefined) values[key] = value;
      }
      const result = validators.create.safeParse(values);
      if (result.success) {
        payload.push(result.data as Record<string, unknown>);
      } else {
        // issuesByField gives one message per field, not a list — indexing it would
        // hand the cell the first *character* of "Required".
        for (const [field, message] of Object.entries(issuesByField(result.error.issues))) {
          found.push({ row: index, field, message });
        }
      }
    }

    if (found.length > 0) {
      setErrors(found);
      setFailure(null);
      const rowsWithErrors = new Set(found.map((issue) => issue.row)).size;
      toast.error(`${rowsWithErrors} ${rowsWithErrors === 1 ? "row needs" : "rows need"} fixing. Nothing was added.`);
      return;
    }

    startTransition(async () => {
      const result = await importRecordsAction(resource.name, payload);
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      const { created, failed } = result.data;
      if (failed.length > 0) {
        // Row numbers come back 1-based over the rows we sent, which are the filled ones.
        setErrors(failed.map((entry) => ({ row: candidates[entry.row - 1]?.index ?? 0, field: entry.field ?? "", message: entry.error })));
        setFailure(`Added ${created}. ${failed.length} ${failed.length === 1 ? "row" : "rows"} were refused — see below.`);
        router.refresh();
        return;
      }
      toast.success(`Added ${created} ${created === 1 ? label.toLowerCase() : resource.pluralLabel.toLowerCase()}.`);
      setRows(Array.from({ length: BLANK_ROWS }, () => ({})));
      setErrors([]);
      setFailure(null);
      setOpen(false);
      router.refresh();
    });
  };

  const filledCount = rows.filter(filled).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <RowsIcon data-icon="inline-start" />
          Bulk add
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="flex h-[92vh] flex-col gap-0 p-0 sm:max-w-none">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Add many {resource.pluralLabel.toLowerCase()}</SheetTitle>
          <SheetDescription>
            Type, or paste a block straight from a spreadsheet. Enter moves down, Tab moves across. Nothing is saved until you add
            them.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {failure && (
            <Alert variant="destructive" className="mb-4">
              <TriangleAlertIcon />
              <AlertTitle>Not everything went in</AlertTitle>
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          )}

          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr>
                <th className="w-10 border-b px-2 py-2 text-left font-normal text-muted-foreground">#</th>
                {columns.map(([key, def]) => (
                  <th key={key} className="border-b px-2 py-2 text-left align-bottom">
                    <span className="block font-medium">
                      {def.label}
                      {def.required && <span className="text-destructive"> *</span>}
                    </span>
                    {columnHint(def) && <span className="block text-xs font-normal text-muted-foreground">{columnHint(def)}</span>}
                  </th>
                ))}
                <th className="w-10 border-b" />
              </tr>
            </thead>
            <tbody ref={gridRef}>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="group">
                  <td className="border-b px-2 py-1 text-xs tabular-nums text-muted-foreground">{rowIndex + 1}</td>
                  {columns.map(([key, def], columnIndex) => {
                    const message = errorAt(rowIndex, key);
                    return (
                      <td key={key} className="border-b p-0 align-top">
                        {def.kind === "file" ? (
                          <div className="min-w-44">
                            <FileField
                              compact
                              id={`bulk-${resource.name}-${key}-${rowIndex}`}
                              field={def as FileFieldDef & { label: string }}
                              value={row[key] ?? ""}
                              onChange={(next) => setCell(rowIndex, key, typeof next === "string" ? next : "")}
                              invalid={Boolean(message)}
                              resourceName={resource.name}
                              fieldKey={key}
                            />
                          </div>
                        ) : def.kind === "boolean" ? (
                          <div className="flex h-9 items-center px-2">
                            <Checkbox
                              checked={["true", "yes", "1"].includes((row[key] ?? "").toLowerCase())}
                              onCheckedChange={(next) => setCell(rowIndex, key, next === true ? "true" : "false")}
                              aria-label={`${def.label}, row ${rowIndex + 1}`}
                            />
                          </div>
                        ) : (
                          <Input
                            data-cell={`${rowIndex}-${columnIndex}`}
                            value={row[key] ?? ""}
                            onChange={(event) => setCell(rowIndex, key, event.target.value)}
                            onPaste={(event) => paste(event, rowIndex, columnIndex)}
                            onKeyDown={(event) => navigate(event, rowIndex, columnIndex)}
                            aria-label={`${def.label}, row ${rowIndex + 1}`}
                            aria-invalid={Boolean(message) || undefined}
                            title={message}
                            list={def.kind === "enum" ? `${resource.name}-${key}-options` : undefined}
                            className={cn(
                              "h-9 rounded-none border-0 border-r shadow-none focus-visible:ring-1 focus-visible:ring-inset",
                              message && "bg-destructive/5 text-destructive",
                            )}
                          />
                        )}
                        {message && <span className="block px-2 pb-1 text-xs text-destructive">{message}</span>}
                      </td>
                    );
                  })}
                  <td className="border-b px-1 text-center align-middle">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Remove row ${rowIndex + 1}`}
                      onClick={() => removeRow(rowIndex)}
                    >
                      <Trash2Icon />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Enum options, offered to every cell in the column without a dropdown per row. */}
          {columns
            .filter(([, def]) => def.kind === "enum")
            .map(([key, def]) => (
              <datalist key={key} id={`${resource.name}-${key}-options`}>
                {"options" in def && def.options.map((option) => <option key={option} value={optionLabel(def, option)} />)}
              </datalist>
            ))}

          <Button variant="outline" size="sm" className="mt-3" onClick={() => addRows(5)} disabled={rows.length >= MAX_ROWS}>
            <PlusIcon data-icon="inline-start" />
            Add 5 rows
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <span className="text-sm text-muted-foreground">
            {filledCount} {filledCount === 1 ? "row" : "rows"} ready{rows.length >= MAX_ROWS ? ` · ${MAX_ROWS} is the most per batch` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || filledCount === 0}>
              {pending && <Spinner data-icon="inline-start" />}
              Add {filledCount > 0 ? filledCount : ""} {filledCount === 1 ? label.toLowerCase() : resource.pluralLabel.toLowerCase()}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
