import { notFound } from "next/navigation";
import { formatValue, storedFields, type Resource } from "@flaredev/core";
import { resourcePath, allResources, dashboardStore, requireAccess } from "@/lib/dashboard";
import type { RelationMeta } from "./fields/field-widget";
import { PageHeader } from "./page-header";
import { ResourceForm } from "./resource-form";

/** Server wrapper for create/edit pages: loads the record and relation titles, renders the heading and form. */
export async function ResourceFormPage({ resource, id }: { resource: Resource; id?: string }) {
  await requireAccess(resource, id ? "update" : "create");
  let record: Record<string, unknown> | null = null;
  if (id) {
    const result = await dashboardStore(resource.name).get(id);
    if (!result.ok) notFound();
    record = result.data;
  }

  const byName = new Map(allResources().map((r) => [r.name, r]));
  const relations: Record<string, RelationMeta & { initialTitle?: string }> = {};
  for (const [key, def] of storedFields(resource)) {
    if (def.kind !== "belongsTo") continue;
    const target = byName.get(def.target);
    if (!target) continue;
    const value = record?.[key];
    const titles = typeof value === "string" ? await dashboardStore(target.name).titles([value]) : {};
    relations[key] = {
      name: target.name,
      label: target.label,
      pluralLabel: target.pluralLabel,
      slug: target.slug,
      titleField: target.titleField,
      initialTitle: typeof value === "string" ? titles[value] : undefined,
    };
  }

  const titleDef = resource.fields[resource.titleField];
  const title =
    record && titleDef && titleDef.kind !== "hasMany" ? formatValue(titleDef, record[resource.titleField]) : `New ${resource.label.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={record ? `Edit this ${resource.label.toLowerCase()}.` : `Add a ${resource.label.toLowerCase()} to ${resource.pluralLabel.toLowerCase()}.`}
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: resource.pluralLabel, href: resourcePath(resource) },
          { label: record ? "Edit" : "New" },
        ]}
      />
      <ResourceForm
        resource={resource}
        mode={record ? "edit" : "create"}
        id={id}
        record={record}
        relations={relations}
        listHref={resourcePath(resource)}
      />
    </div>
  );
}
