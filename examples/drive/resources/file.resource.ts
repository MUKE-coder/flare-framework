import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "File",
  icon: "file",
  fields: {
    // generated:start hash=17c03736c417
    name: field.string(),
    folderId: field.belongsTo("Folder", { required: false, onDelete: "set null" }),
    content: field.file(["any"], { maxBytes: 104857600 }),
    size: field.int(),
    contentType: field.string({ required: false }),
    // generated:end
  },
});
