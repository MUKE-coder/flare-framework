import Link from "next/link";
import { notFound } from "next/navigation";
import { formatValue, optionLabel, relationGraph, statusTone, storedFields, type Resource } from "@flaredev/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { recentAudit } from "@/lib/audit";
import { adminPermissions, allResources, dashboardStore, requireAccess, resourcePath } from "@/lib/dashboard";
import { site } from "@/lib/site";
import { PageHeader } from "./page-header";
import { RecordActions } from "./record-actions";
import type { RelationMeta } from "./fields/field-widget";

const when = (value: unknown) =>
  value instanceof Date ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value) : String(value ?? "—");

/** How many of a record's children to show before pointing at the filtered list. */
const RELATED_LIMIT = 5;

/**
 * One record: its fields, what belongs to it, and what's been done to it.
 *
 * A row in a table is a summary; this is the page you send someone when you want them
 * to look at the thing itself.
 */
export async function RecordDetail({ resource, id }: { resource: Resource; id: string }) {
  await requireAccess(resource, "read");
  const store = dashboardStore(resource.name);
  const result = await store.get(id);
  if (!result.ok) notFound();
  const record = result.data;
  const permissions = await adminPermissions(resource.name);

  const all = allResources();
  const byName = new Map(all.map((item) => [item.name, item]));
  const fields = storedFields(resource);

  // Relation titles, so a belongsTo reads as a name rather than an id.
  const relationTitles: Record<string, string> = {};
  const relations: Record<string, RelationMeta & { initialTitle?: string }> = {};
  for (const [key, def] of fields) {
    if (def.kind !== "belongsTo") continue;
    const target = byName.get(def.target);
    if (!target) continue;
    relations[key] = { name: target.name, label: target.label, pluralLabel: target.pluralLabel, slug: target.slug, titleField: target.titleField };
    const value = record[key];
    if (typeof value === "string") {
      const titles = await dashboardStore(target.name).titles([value]);
      const title = titles[value];
      if (title) relationTitles[key] = title;
    }
  }

  // Children: resources with a belongsTo pointing back here.
  const graph = relationGraph(all);
  const children = (graph.byResource[resource.name]?.hasMany ?? []).flatMap((relation) => {
    const target = byName.get(relation.target);
    return target ? [{ relation, target }] : [];
  });
  const related = await Promise.all(
    children.map(async ({ relation, target }) => {
      const params = new URLSearchParams({ perPage: String(RELATED_LIMIT), [`filter[${relation.foreignKey}]`]: id });
      const list = await dashboardStore(target.name).list(params);
      return { relation, target, rows: list.ok ? list.data.data : [], total: list.ok ? list.data.meta.total : 0, filterKey: relation.foreignKey };
    }),
  );

  const history = await recentAudit(10, resource.name);
  const forThisRecord = history.filter((entry) => entry.recordId === id);

  const titleDef = resource.fields[resource.titleField];
  const title = titleDef && titleDef.kind !== "hasMany" ? String(formatValue(titleDef, record[resource.titleField]) || id) : id;

  return (
    <>
      <PageHeader
        title={title}
        description={`Created ${when(record.createdAt)}`}
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: resource.pluralLabel, href: resourcePath(resource) },
          { label: title },
        ]}
        actions={
          <RecordActions
            resource={resource}
            id={id}
            record={record}
            relations={relations}
            listHref={resourcePath(resource)}
            editHref={resourcePath(resource, id, "edit")}
            canUpdate={permissions.update}
            canDelete={permissions.delete}
            modalForms={site.dashboard.forms === "modal"}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {fields.map(([key, def]) => {
              const value = record[key];
              let content: React.ReactNode = formatValue(def, value);
              if (def.kind === "enum" && value != null) {
                const tone = statusTone(value);
                content = <Badge variant={tone === "neutral" ? "secondary" : tone}>{content}</Badge>;
              } else if (def.kind === "multiselect" && Array.isArray(value) && value.length > 0) {
                content = (
                  <span className="flex flex-wrap gap-1">
                    {value.map((item) => (
                      <Badge key={String(item)} variant="secondary">
                        {optionLabel(def, String(item))}
                      </Badge>
                    ))}
                  </span>
                );
              } else if (def.kind === "belongsTo" && typeof value === "string") {
                const target = byName.get(def.target);
                content = target ? (
                  <Link href={resourcePath(target, value)} className="text-primary hover:underline">
                    {relationTitles[key] ?? value}
                  </Link>
                ) : (
                  value
                );
              }
              return (
                <div key={key} className={def.kind === "text" ? "flex flex-col gap-1 sm:col-span-2" : "flex flex-col gap-1"}>
                  <dt className="text-xs text-muted-foreground">{def.label}</dt>
                  <dd className="text-sm break-words">{content}</dd>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
              <CardDescription>What's been done to this {resource.label.toLowerCase()}.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col">
              {forThisRecord.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing since the audit log started.</p>
              ) : (
                forThisRecord.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-0.5 border-b py-2.5 text-sm last:border-b-0 last:pb-0">
                    <span>
                      <Badge variant={entry.action === "delete" ? "destructive" : "secondary"}>{entry.action}</Badge>
                      <span className="ml-2 text-muted-foreground">{entry.userEmail ?? "someone"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{when(entry.createdAt)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {related.map(({ relation, target, rows, total, filterKey }) => (
            <Card key={relation.key}>
              <CardHeader>
                <CardTitle className="text-base">{target.pluralLabel}</CardTitle>
                <CardDescription>
                  {total === 0 ? `No ${target.pluralLabel.toLowerCase()} yet.` : `${total.toLocaleString()} in total.`}
                </CardDescription>
              </CardHeader>
              {rows.length > 0 && (
                <CardContent className="flex flex-col">
                  {rows.map((row) => {
                    const childTitle = target.fields[target.titleField];
                    const label = childTitle && childTitle.kind !== "hasMany" ? formatValue(childTitle, row[target.titleField]) : String(row.id);
                    return (
                      <Link
                        key={String(row.id)}
                        href={resourcePath(target, String(row.id))}
                        className="truncate border-b py-2 text-sm last:border-b-0 last:pb-0 hover:text-primary"
                      >
                        {label || String(row.id)}
                      </Link>
                    );
                  })}
                  {total > rows.length && (
                    <Button variant="link" className="h-auto justify-start p-0 pt-2" asChild>
                      <Link href={`${resourcePath(target)}?filter[${filterKey}]=${id}`}>See all {total.toLocaleString()}</Link>
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
