import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Folder",
  icon: "folder",
  fields: {
    // generated:start hash=51cbcd2a10b2
    name: field.string(),
    parentId: field.belongsTo("Folder", { required: false, onDelete: "set null" }),
    // generated:end
  },
});
