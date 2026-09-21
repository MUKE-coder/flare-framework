import { notFound } from "next/navigation";
import { formatValue, storedFields, type Resource } from "@flaredev/core";
import { adminPath, adminResources, adminStore, requireAccess } from "@/lib/admin";
import type { RelationMeta } from "./fields/field-widget";
import { ResourceForm } from "./resource-form";

/** Server wrapper for create/edit pages: loads the record and relation titles, renders the heading and form. */
export async function ResourceFormPage({ resource, id }: { resource: Resource; id?: string }) {
  await requireAccess(resource, id ? "update" : "create");
  let record: Record<string, unknown> | null = null;
  if (id) {
    const result = await adminStore(resource.name).get(id);
    if (!result.ok) notFound();
    record = result.data;
  }

  const byName = new Map(adminResources().map((r) => [r.name, r]));
  const relations: Record<string, RelationMeta & { initialTitle?: string }> = {};
  for (const [key, def] of storedFields(resource)) {
    if (def.kind !== "belongsTo") continue;
    const target = byName.get(def.target);
    if (!target) continue;
    const value = record?.[key];
    const titles = typeof value === "string" ? await adminStore(target.name).titles([value]) : {};
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {record && <p className="text-xs text-muted-foreground">Edit {resource.label.toLowerCase()}</p>}
      </div>
      <ResourceForm
        resource={resource}
        mode={record ? "edit" : "create"}
        id={id}
        record={record}
        relations={relations}
        listHref={adminPath(resource)}
      />
    </div>
  );
}
