import { asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { files, folders } from "@/db/schema";

/**
 * Reading the drive: what's in a folder, and how you got there.
 *
 * Folders are a tree in one table — `parent_id` points at another row — so "what's in
 * here" is one query per kind, and "where am I" is a walk up the parents.
 */

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
}

export interface DriveFile {
  id: string;
  name: string;
  size: number;
  contentType: string | null;
  content: string;
  createdAt: Date;
}

/** How deep the tree is allowed to be, so a cycle can't walk forever. */
const MAX_DEPTH = 64;

/** The folder, or null for the root. Throws through `notFound()` at the caller. */
export async function getFolder(id: string): Promise<DriveFolder | null> {
  const [row] = await getDb().select().from(folders).where(eq(folders.id, id)).limit(1);
  return (row as DriveFolder | undefined) ?? null;
}

/**
 * The folders from the root down to this one, for the breadcrumb.
 *
 * A folder can't be inside itself through the UI, but a bad write could make a loop, and
 * a breadcrumb that never ends would take the page down with it — hence the depth cap
 * and the seen set.
 */
export async function trail(id: string | null): Promise<DriveFolder[]> {
  const path: DriveFolder[] = [];
  const seen = new Set<string>();
  let current = id;
  while (current && path.length < MAX_DEPTH && !seen.has(current)) {
    seen.add(current);
    const folder = await getFolder(current);
    if (!folder) break;
    path.unshift(folder);
    current = folder.parentId;
  }
  return path;
}

/** The folders directly inside `parentId` (or the root), by name. */
export async function childFolders(parentId: string | null): Promise<DriveFolder[]> {
  const rows = await getDb()
    .select()
    .from(folders)
    .where(parentId === null ? isNull(folders.parentId) : eq(folders.parentId, parentId))
    .orderBy(asc(folders.name));
  return rows as DriveFolder[];
}

/** The files directly inside `folderId` (or the root), by name. */
export async function folderFiles(folderId: string | null): Promise<DriveFile[]> {
  const rows = await getDb()
    .select({
      id: files.id,
      name: files.name,
      size: files.size,
      contentType: files.contentType,
      content: files.content,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(folderId === null ? isNull(files.folderId) : eq(files.folderId, folderId))
    .orderBy(asc(files.name));
  return rows as DriveFile[];
}

/** Everything in the drive: how many files, and how much room they take. */
export async function driveTotals(): Promise<{ files: number; folders: number; bytes: number }> {
  const db = getDb();
  const [fileRow] = await db.select({ count: sql<number>`count(*)`, bytes: sql<number>`coalesce(sum(${files.size}), 0)` }).from(files);
  const [folderRow] = await db.select({ count: sql<number>`count(*)` }).from(folders);
  return { files: fileRow?.count ?? 0, folders: folderRow?.count ?? 0, bytes: fileRow?.bytes ?? 0 };
}

/**
 * Every folder id under this one, including itself — used when a folder is deleted, so
 * the whole subtree goes with it rather than leaving its contents floating at the root.
 */
export async function subtree(rootId: string): Promise<string[]> {
  const ids = [rootId];
  for (let index = 0; index < ids.length && ids.length < 10_000; index++) {
    const children = await childFolders(ids[index]!);
    for (const child of children) if (!ids.includes(child.id)) ids.push(child.id);
  }
  return ids;
}

/** The URL of a folder, or of the root. */
export const drivePath = (id?: string | null) => (id ? `/dashboard/drive/${id}` : "/dashboard/drive");
