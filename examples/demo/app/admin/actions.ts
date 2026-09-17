"use server";

import { revalidatePath } from "next/cache";
import type { FieldIssue } from "@flare/core/server";
import { adminPath, adminSession, adminStore } from "@/lib/admin";

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
