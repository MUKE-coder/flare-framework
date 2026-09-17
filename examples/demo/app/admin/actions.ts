"use server";

import { revalidatePath } from "next/cache";
import { createObjectKey, matchesContentType, mimeTypesFor } from "@flare/core";
import type { FieldIssue } from "@flare/core/server";
import { storage } from "@/lib/storage";
import { adminPath, adminSession, adminStore, DEFAULT_MAX_UPLOAD } from "@/lib/admin";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; issues?: FieldIssue[]; field?: string };

const forbidden: ActionResult<never> = { ok: false, status: 403, error: "You don't have access to the admin." };

export async function deleteRecordAction(resourceName: string, id: string): Promise<ActionResult<{ id: string }>> {
  if (!(await adminSession()).allowed) return forbidden;
  const store = adminStore(resourceName);
  const result = await store.delete(id);
  if (result.ok) revalidatePath(adminPath(store.resource));
  return result;
}

export async function createRecordAction(resourceName: string, input: unknown): Promise<ActionResult<Record<string, unknown>>> {
  if (!(await adminSession()).allowed) return forbidden;
  const store = adminStore(resourceName);
  const result = await store.create(input);
  if (result.ok) revalidatePath(adminPath(store.resource));
  return result;
}

export async function updateRecordAction(resourceName: string, id: string, input: unknown): Promise<ActionResult<Record<string, unknown>>> {
  if (!(await adminSession()).allowed) return forbidden;
  const store = adminStore(resourceName);
  const result = await store.update(id, input);
  if (result.ok) revalidatePath(adminPath(store.resource));
  return result;
}

/**
 * A short-lived signed URL for uploading to a `file:[…]` field. The content type and
 * size are checked against the descriptor before signing, so a browser can't widen
 * what the field accepts.
 */
export async function createUploadUrlAction(
  resourceName: string,
  fieldKey: string,
  file: { name: string; type: string; size: number },
): Promise<ActionResult<{ url: string; key: string }>> {
  if (!(await adminSession()).allowed) return forbidden;
  const { resource } = adminStore(resourceName);
  const field = resource.fields[fieldKey];
  if (!field || field.kind !== "file") return { ok: false, status: 400, error: `${resourceName} has no file field "${fieldKey}".` };

  const contentTypes = mimeTypesFor(field.accept);
  if (!matchesContentType(file.type || "application/octet-stream", contentTypes)) {
    return { ok: false, status: 415, error: `${field.label} accepts ${field.accept.join(", ")} files.`, field: fieldKey };
  }
  const maxBytes = field.maxBytes ?? DEFAULT_MAX_UPLOAD;
  if (file.size > maxBytes) {
    return { ok: false, status: 413, error: `${field.label} must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`, field: fieldKey };
  }

  const key = createObjectKey(file.name, `${resource.table}/${fieldKey}`);
  const upload = await storage.createUploadUrl({ key, contentTypes, maxBytes });
  return { ok: true, data: { url: upload.url, key: upload.key } };
}

/** A short-lived URL for viewing or downloading a stored file. */
export async function createReadUrlAction(key: string): Promise<ActionResult<{ url: string }>> {
  if (!(await adminSession()).allowed) return forbidden;
  return { ok: true, data: { url: await storage.createReadUrl({ key }) } };
}
