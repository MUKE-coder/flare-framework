"use server";

import { revalidatePath } from "next/cache";
import { createObjectKey, fileKeyPrefix, fileMaxBytes, matchesContentType, mimeTypesFor, type FileField } from "@flaredev/core";
import type { FieldIssue } from "@flaredev/core/server";
import { storage } from "@/lib/storage";
import { can, type PolicyAction } from "@flaredev/core";
import { adminPath, adminSession, adminStore, policyFor } from "@/lib/admin";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; issues?: FieldIssue[]; field?: string };

const forbidden = (message = "You don't have access to the admin."): ActionResult<never> => ({ ok: false, status: 403, error: message });

/** Session + policy check for one action on one resource. */
async function allowed(resourceName: string, action: PolicyAction): Promise<ActionResult<never> | undefined> {
  const { allowed: inAdmin, role } = await adminSession();
  if (!inAdmin) return forbidden();
  if (!can(policyFor(resourceName), role, action)) return forbidden(`Your role can't ${action} this record.`);
}

export async function deleteRecordAction(resourceName: string, id: string): Promise<ActionResult<{ id: string }>> {
  const denied = await allowed(resourceName, "delete");
  if (denied) return denied;

  const store = adminStore(resourceName);
  const result = await store.delete(id);
  if (result.ok) revalidatePath(adminPath(store.resource));
  return result;
}

export async function createRecordAction(resourceName: string, input: unknown): Promise<ActionResult<Record<string, unknown>>> {
  const denied = await allowed(resourceName, "create");
  if (denied) return denied;

  const store = adminStore(resourceName);
  const result = await store.create(input);
  if (result.ok) revalidatePath(adminPath(store.resource));
  return result;
}

export async function updateRecordAction(resourceName: string, id: string, input: unknown): Promise<ActionResult<Record<string, unknown>>> {
  const denied = await allowed(resourceName, "update");
  if (denied) return denied;

  const store = adminStore(resourceName);
  const result = await store.update(id, input);
  if (result.ok) revalidatePath(adminPath(store.resource));
  return result;
}

/** The file field `fieldKey` of a resource, or a failure when it doesn't exist. */
function fileField(
  resourceName: string,
  fieldKey: string,
): { failure: ActionResult<never> } | { field: FileField & { label: string }; prefix: string } {
  const { resource } = adminStore(resourceName);
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
