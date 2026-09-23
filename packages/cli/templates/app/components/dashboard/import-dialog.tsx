"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type ChangeEvent } from "react";
import { DownloadIcon, UploadIcon } from "lucide-react";
import {
  createValidators,
  issuesByField,
  optionLabel,
  storedFields,
  type EnumField,
  type MultiSelectField,
  type Resource,
  type StoredField,
} from "@flaredev/core";
import { importRecordsAction } from "@/app/dashboard/import-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Sentinel for "don't import this field": a SelectItem can't carry an empty value. */
const SKIP = "__skip__";

/** Rows per server action call. Small enough to stay well inside a Worker's time budget. */
const BATCH_SIZE = 500;

const PREVIEW_ROWS = 5;
const LISTED_FAILURES = 10;

type MappedField = [string, StoredField & { label: string }];

/** A row the import rejected, numbered by its line in the file so it can be found again. */
interface RowFailure {
  line: number;
  error: string;
}

interface Summary {
  created: number;
  total: number;
  failures: RowFailure[];
}

/**
 * Rows of a CSV. Written here rather than pulled from a package because the format an
 * import needs is small: quoted fields, commas and newlines inside them, and `""` for a
 * quote. Anything a spreadsheet exports parses; exotic dialects are not the point.
 */
function parseCsv(text: string): string[][] {
  // A BOM from Excel would otherwise become part of the first header.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (quoted) {
      if (char !== '"') value += char;
      else if (source.charAt(index + 1) === '"') {
        value += '"';
        index += 1;
      } else quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source.charAt(index + 1) === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  // Only a genuine last row survives here, so a trailing newline adds no empty record.
  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

const csvCell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const squash = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, "");

/** A field must be mapped when nothing else can supply it: required, with no default. */
const needsColumn = (def: StoredField) => def.required && !("default" in def && def.default !== undefined);

/** An option from a cell holding either the stored value or the label shown in the admin. */
function matchOption(def: EnumField | MultiSelectField, text: string): string {
  const match = def.options.find(
    (option) => option === text || squash(option) === squash(text) || squash(optionLabel(def, option)) === squash(text),
  );
  return match ?? text;
}

/**
 * A cell as the value its field expects. Text that doesn't convert is passed through
 * unchanged so validation reports it against the field, rather than the import guessing.
 */
function toValue(def: StoredField, raw: string): unknown {
  const text = raw.trim();
  if (text === "") return undefined;
  switch (def.kind) {
    case "int":
    case "float": {
      const number = Number(text);
      return Number.isFinite(number) ? number : text;
    }
    case "boolean": {
      const lower = text.toLowerCase();
      if (["true", "yes", "1"].includes(lower)) return true;
      if (["false", "no", "0"].includes(lower)) return false;
      return text;
    }
    case "enum":
      return matchOption(def, text);
    case "multiselect":
      return text
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => matchOption(def, part));
    default:
      // Dates keep their text: the descriptor's schema decides which formats it takes.
      return text;
  }
}

/** A column per field, matched on header text; anything unrecognised starts as Skip. */
function guessMapping(fields: MappedField[], headers: string[]): Record<string, string> {
  const taken = new Set<number>();
  const mapping: Record<string, string> = {};
  for (const [key, def] of fields) {
    const names = [squash(key), squash(def.label)];
    const index = headers.findIndex((header, position) => !taken.has(position) && names.includes(squash(header)));
    mapping[key] = index === -1 ? SKIP : String(index);
    if (index !== -1) taken.add(index);
  }
  return mapping;
}

/**
 * Creates records from a CSV: pick a file, match its columns to the resource's fields,
 * check the preview, then import. Rows are validated in the browser with the descriptor's
 * schemas and again on the server, and sent in batches so a long file reports progress
 * and never depends on one very long request.
 */
export function ImportDialog({ resource }: { resource: Resource }) {
  const router = useRouter();
  const validators = useMemo(() => createValidators(resource), [resource]);
  // Uploads need a signed URL per file, which a CSV cell can't stand in for.
  const fields = useMemo(() => storedFields(resource).filter(([, def]) => def.kind !== "file"), [resource]);

  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState("");
  const [importError, setImportError] = useState("");
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const mapped = fields.filter(([key]) => mapping[key] !== undefined && mapping[key] !== SKIP);
  const unmapped = fields.filter(([key, def]) => needsColumn(def) && (mapping[key] === undefined || mapping[key] === SKIP));
  const ready = rows.length > 0 && mapped.length > 0 && unmapped.length === 0;

  function reset() {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setFileError("");
    setImportError("");
    setProgress(0);
    setSummary(null);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    reset();

    const [head = [], ...body] = parseCsv(await file.text());
    if (head.length === 0 || body.length === 0) {
      setFileError("That file has no rows to import. A CSV needs a header row and at least one row under it.");
      return;
    }
    setFileName(file.name);
    setHeaders(head);
    setRows(body);
    setMapping(guessMapping(fields, head));
  }

  function toInput(cells: string[]): Record<string, unknown> {
    const input: Record<string, unknown> = {};
    for (const [key, def] of mapped) {
      const value = toValue(def, cells[Number(mapping[key])] ?? "");
      // An empty cell leaves the field out entirely, so its default applies as on create.
      if (value !== undefined) input[key] = value;
    }
    return input;
  }

  async function runImport() {
    setRunning(true);
    setImportError("");
    setSummary(null);
    setProgress(0);

    const failures: RowFailure[] = [];
    let created = 0;

    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const accepted: Record<string, unknown>[] = [];
      const lines: number[] = [];

      batch.forEach((cells, offset) => {
        // The header is line 1, so the first record is line 2 of the file.
        const line = start + offset + 2;
        const input = toInput(cells);
        const parsed = validators.create.safeParse(input);
        if (parsed.success) {
          accepted.push(input);
          lines.push(line);
          return;
        }
        const issues = Object.entries(issuesByField(parsed.error.issues));
        failures.push({
          line,
          error: issues.map(([key, message]) => (key === "_form" ? message : `${key}: ${message}`)).join("; "),
        });
      });

      if (accepted.length > 0) {
        const result = await importRecordsAction(resource.name, accepted);
        if (!result.ok) {
          setImportError(result.error);
          setSummary({ created, total: rows.length, failures });
          setRunning(false);
          if (created > 0) router.refresh();
          return;
        }
        created += result.data.created;
        for (const failure of result.data.failed) {
          failures.push({ line: lines[failure.row - 1] ?? start + failure.row + 1, error: failure.error });
        }
      }

      setProgress(Math.round(((start + batch.length) / rows.length) * 100));
    }

    failures.sort((first, second) => first.line - second.line);
    setSummary({ created, total: rows.length, failures });
    setRunning(false);
    if (created > 0) router.refresh();
  }

  function downloadFailures(failures: RowFailure[]) {
    const csv = [
      [...headers, "Import error"],
      ...failures.map((failure) => [...(rows[failure.line - 2] ?? []), failure.error]),
    ]
      .map((cells) => cells.map(csvCell).join(","))
      .join("\r\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName.replace(/\.csv$/i, "") || resource.slug}-failed.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UploadIcon data-icon="inline-start" />
          Import CSV
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import {resource.pluralLabel.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Upload a CSV, match its columns to fields, then import. Every row is created as a new {resource.label.toLowerCase()}; nothing
            already saved is changed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          <Field data-invalid={fileError ? true : undefined}>
            <FieldLabel htmlFor="import-file">CSV file</FieldLabel>
            <Input id="import-file" type="file" accept=".csv,text/csv" disabled={running} onChange={onFile} />
          </Field>

          {fileError && (
            <Alert variant="destructive">
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          )}

          {rows.length > 0 && !summary && (
            <>
              <div className="grid gap-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">Match columns</h3>
                  <p className="text-sm text-muted-foreground">
                    {rows.length} {rows.length === 1 ? "row" : "rows"} in {fileName}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {fields.map(([key, def]) => (
                    <Field key={key}>
                      <FieldLabel htmlFor={`import-map-${key}`}>
                        {def.label}
                        {needsColumn(def) && (
                          <span className="ml-0.5 text-muted-foreground" aria-hidden>
                            *
                          </span>
                        )}
                      </FieldLabel>
                      <Select
                        value={mapping[key] ?? SKIP}
                        disabled={running}
                        onValueChange={(value) => setMapping((current) => ({ ...current, [key]: value }))}
                      >
                        <SelectTrigger id={`import-map-${key}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value={SKIP}>Skip</SelectItem>
                            {headers.map((header, index) => (
                              <SelectItem key={index} value={String(index)}>
                                {header || `Column ${index + 1}`}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  ))}
                </div>
              </div>

              {unmapped.length > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>Match every required field first</AlertTitle>
                  <AlertDescription>
                    {unmapped.map(([, def]) => def.label).join(", ")} {unmapped.length === 1 ? "has" : "have"} no column. Pick one for each,
                    or add the column to your file.
                  </AlertDescription>
                </Alert>
              )}

              {mapped.length > 0 && (
                <div className="grid gap-2">
                  <h3 className="text-sm font-medium">Preview</h3>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {mapped.map(([key, def]) => (
                            <TableHead key={key}>{def.label}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.slice(0, PREVIEW_ROWS).map((cells, index) => (
                          <TableRow key={index}>
                            {mapped.map(([key]) => {
                              const cell = cells[Number(mapping[key])] ?? "";
                              return (
                                <TableCell key={key} className="max-w-48 truncate">
                                  {cell || <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {rows.length > PREVIEW_ROWS && (
                    <p className="text-sm text-muted-foreground">
                      Showing the first {PREVIEW_ROWS} of {rows.length} rows.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {running && (
            <div className="grid gap-2">
              <Progress value={progress} aria-label={`Importing ${resource.pluralLabel.toLowerCase()}`} />
              <p className="text-sm text-muted-foreground">Importing… {progress}% done. Leave this open until it finishes.</p>
            </div>
          )}

          {importError && (
            <Alert variant="destructive">
              <AlertTitle>The import stopped</AlertTitle>
              <AlertDescription>{importError}</AlertDescription>
            </Alert>
          )}

          {summary && (
            <div className="grid gap-4">
              <p className="text-sm">
                Imported {summary.created} of {summary.total} {summary.total === 1 ? "row" : "rows"}.
              </p>
              {summary.failures.length > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>
                    {summary.failures.length} {summary.failures.length === 1 ? "row was" : "rows were"} skipped
                  </AlertTitle>
                  <AlertDescription>
                    <ul className="grid gap-1">
                      {summary.failures.slice(0, LISTED_FAILURES).map((failure) => (
                        <li key={failure.line}>
                          Line {failure.line}: {failure.error}
                        </li>
                      ))}
                    </ul>
                    {summary.failures.length > LISTED_FAILURES && (
                      <p>And {summary.failures.length - LISTED_FAILURES} more. Download the failed rows to see them all.</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {summary && summary.failures.length > 0 && (
            <Button variant="outline" onClick={() => downloadFailures(summary.failures)}>
              <DownloadIcon data-icon="inline-start" />
              Download failed rows
            </Button>
          )}
          {summary ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button disabled={!ready || running} onClick={runImport}>
              {running && <Spinner data-icon="inline-start" />}
              Import {rows.length > 0 ? `${rows.length} ` : ""}
              {rows.length === 1 ? "row" : "rows"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
