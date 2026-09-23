// Drizzle relations for every resource (maintained by flare gen).
// generated:start hash=b0b5aa95b8da
import { relations } from "drizzle-orm";
import { files } from "./schema/files";
import { folders } from "./schema/folders";

export const filesRelations = relations(files, ({ one }) => ({
  folder: one(folders, { fields: [files.folderId], references: [folders.id], relationName: "files_folder_id" }),
}));

export const foldersRelations = relations(folders, ({ one }) => ({
  parent: one(folders, { fields: [folders.parentId], references: [folders.id], relationName: "folders_parent_id" }),
}));
// generated:end
