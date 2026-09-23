// Server-only: resource name → descriptor and table (maintained by flare gen).
// generated:start hash=99855896bd90
import { files, folders } from "@/db/schema";
import { fileResource, folderResource } from "./index";

export const resourceTables = {
  File: { resource: fileResource, table: files },
  Folder: { resource: folderResource, table: folders },
} as const;

export type ResourceName = keyof typeof resourceTables;
// generated:end
