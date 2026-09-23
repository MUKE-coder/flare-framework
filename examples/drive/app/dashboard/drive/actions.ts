"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { files } from "@/db/schema";
import { drivePath, subtree } from "@/lib/drive";
import { storage } from "@/lib/storage";
import { dashboardStore } from "@/lib/dashboard";
import { createRecordAction, deleteRecordAction, updateRecordAction, type ActionResult } from "../actions";

/**
 * What the drive does beyond ordinary records.
 *
 * Creating, renaming and deleting one thing is what the generated actions already do, so
 * those are re-exported rather than rewritten — the policies, the audit log and the
 * validation come with them. Only the two jobs that are the drive's own are written here:
 * saving a file after its bytes are in storage, and deleting a folder with its contents.
 */

export async function createFolderAction(name: string, parentId: string | null): Promise<ActionResult<Record<string, unknown>>> {
  const result = await createRecordAction("Folder", { name: name.trim(), parentId: parentId ?? null });
  if (result.ok) revalidatePath(drivePath(parentId));
  return result;
}

/** The record for a file whose bytes are already in storage. */
export async function saveFileAction(input: {
  name: string;
  folderId: string | null;
  content: string;
  size: number;
  contentType: string | null;
}): Promise<ActionResult<Record<string, unknown>>> {
  const result = await createRecordAction("File", {
    name: input.name,
    folderId: input.folderId ?? null,
    content: input.content,
    size: input.size,
    contentType: input.contentType,
  });
  if (result.ok) revalidatePath(drivePath(input.folderId));
  return result;
}

export async function renameAction(kind: "Folder" | "File", id: string, name: string): Promise<ActionResult<Record<string, unknown>>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, status: 422, error: "A name can't be empty.", field: "name" };
  const result = await updateRecordAction(kind, id, { name: trimmed });
  if (result.ok) revalidatePath("/dashboard/drive", "layout");
  return result;
}

export async function deleteFileAction(id: string, folderId: string | null): Promise<ActionResult<{ id: string }>> {
  const result = await deleteRecordAction("File", id);
  if (result.ok) revalidatePath(drivePath(folderId));
  return result;
}

/**
 * Delete a folder and everything under it.
 *
 * A folder's rows point at their parent with `on delete set null`, so deleting only the
 * folder would empty it onto the root instead — every file that was inside would appear
 * at the top of the drive. So the subtree is collected first, its files are deleted
 * through the store (which takes their objects out of storage with them), and the
 * folders go last, deepest first.
 */
export async function deleteFolderAction(id: string, parentId: string | null): Promise<ActionResult<{ folders: number; files: number }>> {
  const ids = await subtree(id);
  const doomed = await getDb().select({ id: files.id, content: files.content }).from(files).where(inArray(files.folderId, ids));

  const fileStore = dashboardStore("File");
  for (const file of doomed) {
    const result = await fileStore.delete(file.id);
    if (!result.ok) return result;
    if (file.content) await storage.delete(file.content).catch(() => undefined);
  }

  const folderStore = dashboardStore("Folder");
  for (const folderId of [...ids].reverse()) {
    const result = await folderStore.delete(folderId);
    if (!result.ok) return result;
  }

  revalidatePath(drivePath(parentId));
  return { ok: true, data: { folders: ids.length, files: doomed.length } };
}
