"use server";

import { revalidatePath } from "next/cache";
import { createObjectKey, fileKeyPrefix, fileMaxBytes, matchesContentType, mimeTypesFor, type FileField } from "@flaredev/core";
import type { FieldIssue } from "@flaredev/core/server";
import { diffFields, recordAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { storage } from "@/lib/storage";
import { can, storedFields, type PolicyAction } from "@flaredev/core";
import { resourcePath, dashboardSession, dashboardStore, policyFor } from "@/lib/dashboard";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; issues?: FieldIssue[]; field?: string };

const forbidden = (message = "You don't have access to this."): ActionResult<never> => ({ ok: false, status: 403, error: message });

/** Session + policy check for one action on one resource. */
async function allowed(resourceName: string, action: PolicyAction): Promise<ActionResult<never> | undefined> {
  const { allowed: inAdmin, role } = await dashboardSession();
  if (!inAdmin) return forbidden();
  if (!can(policyFor(resourceName), role, action)) return forbidden(`Your role can't ${action} this record.`);
}

export async function deleteRecordAction(resourceName: string, id: string): Promise<ActionResult<{ id: string }>> {
  const denied = await allowed(resourceName, "delete");
  if (denied) return denied;

  const store = dashboardStore(resourceName);
  const existing = await store.get(id);
  const result = await store.delete(id);
  if (result.ok) {
    await recordAudit({
      action: "delete",
      resource: resourceName,
      recordId: id,
      recordLabel: existing.ok ? recordTitle(store.resource, existing.data) : null,
    });
    revalidatePath(resourcePath(store.resource));
  }
  return result;
}

/** What to call a record in the audit log: its title field, falling back to its id. */
function recordTitle(resource: { titleField: string }, record: Record<string, unknown>): string {
  const value = record[resource.titleField];
  return typeof value === "string" && value ? value : String(record.id ?? "");
}

/** How many rows one export may fetch: enough for a spreadsheet, not enough to exhaust the Worker. */
const EXPORT_LIMIT = 50_000;
const EXPORT_PAGE = 500;

export async function deleteManyAction(resourceName: string, ids: string[]): Promise<ActionResult<{ deleted: number; failed: number }>> {
  const denied = await allowed(resourceName, "delete");
  if (denied) return denied;
  if (ids.length === 0) return { ok: true, data: { deleted: 0, failed: 0 } };
  if (ids.length > 500) return { ok: false, status: 400, error: "That's more than 500 records. Delete them in smaller batches." };

  const store = dashboardStore(resourceName);
  // One at a time, through the store: deleting a record runs its policy, its hooks and
  // its cache invalidation, and a row that refuses to go (a foreign key still pointing
  // at it) shouldn't take the rest of the batch with it.
  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    const result = await store.delete(id);
    if (result.ok) deleted++;
    else failed++;
  }
  if (deleted > 0) {
    await recordAudit({ action: "bulk-delete", resource: resourceName, changes: { deleted, failed } });
    revalidatePath(resourcePath(store.resource));
  }
  return { ok: true, data: { deleted, failed } };
}

/**
 * Every record matching the current search and filters, as CSV.
 *
 * Read through the same store the table uses, so the export shows exactly what the
 * person can see — their policy, their filters, their sort.
 */
export async function exportRecordsAction(resourceName: string, query: string): Promise<ActionResult<{ csv: string; rows: number; truncated: boolean }>> {
  const denied = await allowed(resourceName, "read");
  if (denied) return denied;

  const store = dashboardStore(resourceName);
  const fields = storedFields(store.resource).filter(([, def]) => def.kind !== "file");
  const columns = [["id", "Id"] as const, ...fields.map(([key, def]) => [key, def.label] as const), ["createdAt", "Created"] as const];

  const rows: Record<string, unknown>[] = [];
  let truncated = false;
  for (let page = 1; rows.length < EXPORT_LIMIT; page++) {
    const params = new URLSearchParams(query);
    params.set("page", String(page));
    params.set("perPage", String(EXPORT_PAGE));
    const result = await store.list(params);
    if (!result.ok) return result;
    rows.push(...result.data.data);
    if (page >= result.data.meta.totalPages) break;
    if (rows.length >= EXPORT_LIMIT) {
      truncated = true;
      break;
    }
  }

  const csv = toCsv(rows, columns.map(([key, label]) => ({ key, label })));
  return { ok: true, data: { csv, rows: rows.length, truncated } };
}

export async function createRecordAction(resourceName: string, input: unknown): Promise<ActionResult<Record<string, unknown>>> {
  const denied = await allowed(resourceName, "create");
  if (denied) return denied;

  const store = dashboardStore(resourceName);
  const result = await store.create(input);
  if (result.ok) {
    await recordAudit({
      action: "create",
      resource: resourceName,
      recordId: String(result.data.id),
      recordLabel: recordTitle(store.resource, result.data),
      changes: diffFields(null, result.data),
    });
    revalidatePath(resourcePath(store.resource));
  }
  return result;
}

export async function updateRecordAction(resourceName: string, id: string, input: unknown): Promise<ActionResult<Record<string, unknown>>> {
  const denied = await allowed(resourceName, "update");
  if (denied) return denied;

  const store = dashboardStore(resourceName);
  const before = await store.get(id);
  const result = await store.update(id, input);
  if (result.ok) {
    await recordAudit({
      action: "update",
      resource: resourceName,
      recordId: id,
      recordLabel: recordTitle(store.resource, result.data),
      changes: diffFields(before.ok ? before.data : null, result.data),
    });
    revalidatePath(resourcePath(store.resource));
  }
  return result;
}

/** The file field `fieldKey` of a resource, or a failure when it doesn't exist. */
function fileField(
  resourceName: string,
  fieldKey: string,
): { failure: ActionResult<never> } | { field: FileField & { label: string }; prefix: string } {
  const { resource } = dashboardStore(resourceName);
  const field = resource.fields[fieldKey];
  if (!field || field.kind !== "file") {
    return { failure: { ok: false, status: 400, error: `${resourceName} has no file field "${fieldKey}".` } };
  }
  return { field, prefix: fileKeyPrefix(resource, fieldKey) };
}

/**
 * A short-lived signed URL for uploading to a `file:[…]` field. The declared type and
 * size are checked against the descriptor before signing, so a browser can't widen
 * what the field accepts; the storage route then checks the bytes really are that type.
 */
export async function createUploadUrlAction(
  resourceName: string,
  fieldKey: string,
  file: { name: string; type: string; size: number },
): Promise<ActionResult<{ url: string; key: string }>> {
  // Uploading is part of creating or editing a record, so either permission is enough.
  const deniedCreate = await allowed(resourceName, "create");
  const deniedUpdate = await allowed(resourceName, "update");
  if (deniedCreate && deniedUpdate) return deniedUpdate;

  const target = fileField(resourceName, fieldKey);
  if ("failure" in target) return target.failure;
  const { field, prefix } = target;

  const contentTypes = mimeTypesFor(field.accept);
  if (!matchesContentType(file.type || "application/octet-stream", contentTypes)) {
    return { ok: false, status: 415, error: `${field.label} accepts ${field.accept.join(", ")} files.`, field: fieldKey };
  }
  const maxBytes = fileMaxBytes(field);
  if (file.size > maxBytes) {
    return { ok: false, status: 413, error: `${field.label} must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`, field: fieldKey };
  }

  const upload = await storage.createUploadUrl({ key: createObjectKey(file.name, prefix), contentTypes, maxBytes });
  return { ok: true, data: { url: upload.url, key: upload.key } };
}

/**
 * A short-lived URL for viewing a file stored in a `file:[…]` field. Only keys under that
 * field's prefix are signed, and only for roles that can work with the resource, so a
 * guessed or borrowed key can't be read through a resource the role can't see.
 */
export async function createReadUrlAction(resourceName: string, fieldKey: string, key: string): Promise<ActionResult<{ url: string }>> {
  const denied = await allowed(resourceName, "read");
  // Someone creating or editing a record can view what they just uploaded.
  if (denied && (await allowed(resourceName, "create")) && (await allowed(resourceName, "update"))) return denied;

  const target = fileField(resourceName, fieldKey);
  if ("failure" in target) return target.failure;
  if (!key.startsWith(target.prefix)) return { ok: false, status: 403, error: "That file doesn't belong to this field.", field: fieldKey };

  return { ok: true, data: { url: await storage.createReadUrl({ key }) } };
}
