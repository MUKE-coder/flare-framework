import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { clientResource, formatValue, optionLabel, statusTone, storedFields, type Resource, type StoredField } from "@flaredev/core";
import { isSortable } from "@flaredev/core/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resourcePath, adminPermissions, allResources, dashboardStore, requireAccess } from "@/lib/dashboard";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { ColumnMenu } from "./column-menu";
import { ExportButton } from "./export-button";
import { isInlineEditable } from "./editable";
import { InlineCell } from "./inline-cell";
import type { RelationMeta } from "./fields/field-widget";
import { ImportDialog } from "./import-dialog";
import { LocalTime } from "./local-time";
import { hrefWith, toSearchParams, type SearchParams } from "./query";
import { NewRecordButton } from "./resource-form-sheet";
import { ResourceTableToolbar } from "./resource-table-toolbar";
import { SaveViewButton } from "./save-view-button";
import { RowActions } from "./row-actions";
import { RowCheckbox, SelectAllCheckbox, SelectionBar, TableSelection } from "./table-selection";

type Column = { key: string; label: string; def: StoredField | { kind: "timestamp" } };

const NUMERIC = new Set(["int", "float"]);

/**
 * Paginated, sortable, filterable list of a resource's records. Everything comes from the
 * descriptor: columns (fields with `list`), sortable headers, search, and filters. State
 * lives in the URL (?page, ?sort, ?q, ?filter[field]), so views are linkable and work
 * without client-side data fetching.
 */
export async function ResourceTable({ resource, searchParams }: { resource: Resource; searchParams: SearchParams }) {
  await requireAccess(resource, "read");
  // Hooks and computed values are functions, and a function can't be sent to the browser.
  // This is the same resource without them, for the client components below.
  const forClient = clientResource(resource);
  const basePath = resourcePath(resource);
  const permissions = await adminPermissions(resource.name);
  const params = toSearchParams(searchParams);
  const store = dashboardStore(resource.name);

  let result = await store.list(params);
  let ignoredQuery = false;
  if (!result.ok) {
    ignoredQuery = true;
    result = await store.list(new URLSearchParams());
  }
  if (!result.ok) throw new Error(result.error);
  const { data: rows, meta } = result.data;

  const fields = storedFields(resource);
  const allColumns: Column[] = [
    ...fields.filter(([, def]) => def.list !== false).map(([key, def]) => ({ key, label: def.label, def })),
    { key: "createdAt", label: "Created", def: { kind: "timestamp" as const } },
  ];
  // ?columns=name,email narrows the table; anything unknown in it is ignored.
  const chosen = (params.get("columns") ?? "").split(",").filter(Boolean);
  const columns = chosen.length > 0 ? allColumns.filter((column) => chosen.includes(column.key)) : allColumns;

  // Resolve belongsTo ids to their related record titles, one query per relation.
  const byName = new Map(allResources().map((r) => [r.name, r]));
  const titles: Record<string, Record<string, string>> = {};
  await Promise.all(
    columns.map(async ({ key, def }) => {
      if (def.kind !== "belongsTo") return;
      const ids = rows.map((row) => row[key]).filter((id): id is string => typeof id === "string");
      titles[key] = byName.has(def.target) ? await dashboardStore(def.target).titles(ids) : {};
    }),
  );

  // The dialog form needs the same relation metadata the form page builds.
  const relations: Record<string, RelationMeta & { initialTitle?: string }> = {};
  for (const [key, def] of fields) {
    if (def.kind !== "belongsTo") continue;
    const target = byName.get(def.target);
    if (!target) continue;
    relations[key] = { name: target.name, label: target.label, pluralLabel: target.pluralLabel, slug: target.slug, titleField: target.titleField };
  }

  const overlayForms = site.dashboard.forms === "sheet";
  const rowIds = rows.map((row) => String(row.id));
  const exportColumns = [{ key: "id", label: "Id" }, ...fields.filter(([, def]) => def.kind !== "file").map(([key, def]) => ({ key, label: def.label }))];

  const sort = params.get("sort") ?? `${resource.defaultSort.direction === "desc" ? "-" : ""}${resource.defaultSort.field}`;
  const sortField = sort.replace(/^-/, "");
  const sortDescending = sort.startsWith("-");
  const activeFilters = [...params.keys()].filter((key) => key.startsWith("filter[")).length + (params.get("q") ? 1 : 0);
  const first = meta.total === 0 ? 0 : (meta.page - 1) * meta.perPage + 1;
  const last = Math.min(meta.page * meta.perPage, meta.total);

  return (
    <TableSelection ids={rowIds}>
      <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResourceTableToolbar resource={forClient} />
        <div className="flex flex-wrap items-center gap-2">
          <SaveViewButton resourceName={resource.name} label={resource.pluralLabel} />
          <ColumnMenu columns={allColumns.map(({ key, label }) => ({ key, label }))} visible={columns.map((column) => column.key)} />
          <ExportButton resourceName={resource.name} pluralLabel={resource.pluralLabel} />
          {permissions.create && <ImportDialog resource={forClient} />}
          {permissions.create &&
            (overlayForms ? (
              <NewRecordButton resource={forClient} relations={relations} listHref={basePath} />
            ) : (
              <Button asChild>
                <Link href={resourcePath(resource, "new")}>
                  <PlusIcon data-icon="inline-start" />
                  New {resource.label.toLowerCase()}
                </Link>
              </Button>
            ))}
        </div>
      </div>

      {ignoredQuery && (
        <Alert>
          <AlertDescription>Some filters or sorting in the address weren&apos;t valid for {resource.pluralLabel.toLowerCase()} and were ignored.</AlertDescription>
        </Alert>
      )}

      {rows.length === 0 ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{activeFilters ? `No ${resource.pluralLabel.toLowerCase()} match` : `No ${resource.pluralLabel.toLowerCase()} yet`}</EmptyTitle>
            <EmptyDescription>
              {activeFilters ? "Try a different search or clear the filters." : `Create the first ${resource.label.toLowerCase()} to see it here.`}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {activeFilters || !permissions.create ? (
              <Button variant="outline" asChild>
                <Link href={basePath}>Clear filters</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={resourcePath(resource, "new")}>
                  <PlusIcon data-icon="inline-start" />
                  New {resource.label.toLowerCase()}
                </Link>
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-muted">
                <TableHead className="w-10">
                  <SelectAllCheckbox label={resource.pluralLabel.toLowerCase()} />
                </TableHead>
                {columns.map((column) => {
                  const sortable = column.key === "createdAt" || (column.def.kind !== "timestamp" && isSortable(column.def));
                  const active = sortField === column.key;
                  const nextSort = active && !sortDescending ? `-${column.key}` : column.key;
                  const SortIcon = !active ? ChevronsUpDownIcon : sortDescending ? ArrowDownIcon : ArrowUpIcon;
                  return (
                    <TableHead key={column.key} className={cn(NUMERIC.has(column.def.kind) && "text-right")}>
                      {sortable ? (
                        <Link
                          href={hrefWith(basePath, params, { sort: nextSort })}
                          className="group inline-flex items-center gap-1 hover:text-foreground"
                          aria-label={`Sort by ${column.label}`}
                        >
                          {column.label}
                          <SortIcon className={cn("size-3.5", active ? "opacity-100" : "opacity-0 group-hover:opacity-60")} />
                        </Link>
                      ) : (
                        column.label
                      )}
                    </TableHead>
                  );
                })}
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const id = String(row.id);
                return (
                  <TableRow key={id}>
                    <TableCell className="w-10">
                      <RowCheckbox id={id} label={rowLabel(resource, row)} />
                    </TableCell>
                    {columns.map((column, index) => {
                      const value = row[column.key];
                      let content: React.ReactNode = formatValue(column.def, value);
                      // Timestamps are formatted in the browser: the Worker's clock is UTC,
                      // so a date rendered here would be in nobody's timezone.
                      if ((column.def.kind === "timestamp" || column.def.kind === "datetime") && value != null) {
                        content = <LocalTime value={value as string | number | Date} />;
                      } else if (column.def.kind === "enum" && value != null) {
                        const tone = statusTone(value);
                        content = <Badge variant={tone === "neutral" ? "secondary" : tone}>{content}</Badge>;
                      } else if (column.def.kind === "multiselect" && Array.isArray(value) && value.length) {
                        const def = column.def;
                        content = (
                          <span className="flex flex-wrap gap-1">
                            {value.map((item) => (
                              <Badge key={String(item)} variant="secondary">
                                {optionLabel(def, String(item))}
                              </Badge>
                            ))}
                          </span>
                        );
                      } else if (index !== 0 && column.def.kind === "string" && typeof value === "string" && value) {
                        // Contact-style values are links; a colour shows its swatch.
                        const format = column.def.format;
                        const href =
                          format === "email" ? `mailto:${value}` : format === "tel" ? `tel:${value}` : format === "url" ? value : format === "domain" ? `https://${value}` : undefined;
                        if (href) {
                          content = (
                            <a href={href} className="hover:underline" {...(format === "url" || format === "domain" ? { target: "_blank", rel: "noreferrer" } : {})}>
                              {content}
                            </a>
                          );
                        } else if (format === "color") {
                          content = (
                            <span className="inline-flex items-center gap-2 font-mono text-xs">
                              <span className="size-3.5 rounded-sm border" style={{ backgroundColor: value }} aria-hidden="true" />
                              {value}
                            </span>
                          );
                        }
                      } else if (column.def.kind === "belongsTo" && typeof value === "string") {
                        const target = byName.get(column.def.target);
                        content = target ? (
                          <Link href={resourcePath(target, value)} className="hover:underline">
                            {titles[column.key]?.[value] ?? value}
                          </Link>
                        ) : (
                          value
                        );
                      } else if (index === 0) {
                        content = (
                          <Link href={resourcePath(resource, id)} className="font-medium hover:underline">
                            {content}
                          </Link>
                        );
                      }
                      // The first column is the link to the record; the rest of the simple
                      // ones can be changed where they are.
                      if (index !== 0 && permissions.update && column.def.kind !== "timestamp" && isInlineEditable(column.def)) {
                        content = (
                          <InlineCell
                            resourceName={resource.name}
                            id={id}
                            fieldKey={column.key}
                            def={column.def as StoredField & { label: string }}
                            value={value}
                          >
                            {content}
                          </InlineCell>
                        );
                      }
                      return (
                        <TableCell
                          key={column.key}
                          className={cn(
                            "max-w-80 truncate",
                            NUMERIC.has(column.def.kind) && "text-right tabular-nums",
                            (column.def.kind === "timestamp" || column.def.kind === "datetime" || column.def.kind === "date") &&
                              "text-muted-foreground tabular-nums",
                          )}
                        >
                          {content}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      <RowActions
                        resource={forClient}
                        id={id}
                        record={overlayForms ? row : undefined}
                        relations={relations}
                        listHref={basePath}
                        editHref={resourcePath(resource, id, "edit")}
                        detailHref={resourcePath(resource, id)}
                        canUpdate={permissions.update}
                        canDelete={permissions.delete}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {(meta.total > 0 || rows.length > 0) && (
        <div className="flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <p className="tabular-nums">
            {meta.exactTotal ? (
              <>
                {first}–{last} of {meta.total.toLocaleString()} {meta.total === 1 ? resource.label.toLowerCase() : resource.pluralLabel.toLowerCase()}
              </>
            ) : (
              <>
                Showing {rows.length} of more than {meta.total.toLocaleString()} {resource.pluralLabel.toLowerCase()}
              </>
            )}
            {activeFilters > 0 && ` · ${activeFilters} filter${activeFilters === 1 ? "" : "s"} applied`}
          </p>

          {meta.exactTotal && meta.totalPages > 1 && (
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={hrefWith(basePath, params, { page: String(Math.max(1, meta.page - 1)) })}
                    aria-disabled={meta.page === 1}
                    className={cn(meta.page === 1 && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
                {pageWindow(meta.page, meta.totalPages).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink href={hrefWith(basePath, params, { page: String(page) })} isActive={page === meta.page}>
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href={hrefWith(basePath, params, { page: String(Math.min(meta.totalPages, meta.page + 1)) })}
                    aria-disabled={meta.page === meta.totalPages}
                    className={cn(meta.page === meta.totalPages && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}

          {/* Past the count limit, pages are walked with cursors: numbering them would mean
              counting every row, and jumping to page 20,000 would mean reading the 500,000
              rows before it. */}
          {!meta.exactTotal && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild={Boolean(meta.prevCursor)} disabled={!meta.prevCursor}>
                {meta.prevCursor ? (
                  <Link href={hrefWith(basePath, params, { cursor: meta.prevCursor, page: null })}>
                    <ChevronLeftIcon data-icon="inline-start" />
                    Previous
                  </Link>
                ) : (
                  <span>
                    <ChevronLeftIcon data-icon="inline-start" />
                    Previous
                  </span>
                )}
              </Button>
              <Button variant="outline" size="sm" asChild={Boolean(meta.nextCursor)} disabled={!meta.nextCursor}>
                {meta.nextCursor ? (
                  <Link href={hrefWith(basePath, params, { cursor: meta.nextCursor, page: null })}>
                    Next
                    <ChevronRightIcon data-icon="inline-end" />
                  </Link>
                ) : (
                  <span>
                    Next
                    <ChevronRightIcon data-icon="inline-end" />
                  </span>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      <SelectionBar
        resourceName={resource.name}
        label={resource.label}
        pluralLabel={resource.pluralLabel}
        canDelete={permissions.delete}
        rows={rows}
        columns={exportColumns}
      />
      </div>
    </TableSelection>
  );
}

/** What a row is called, for the checkbox's label. */
function rowLabel(resource: Resource, row: Record<string, unknown>): string {
  const value = row[resource.titleField];
  return typeof value === "string" && value ? value : String(row.id);
}

/** Up to five page numbers centred on the current page. */
function pageWindow(page: number, totalPages: number): number[] {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
}
