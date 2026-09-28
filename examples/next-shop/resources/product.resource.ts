import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Product",
  icon: "package",
  group: "Catalogue",
  fields: {
    // generated:start hash=ec79189a72e4
    name: field.string(),
    sku: field.string({ unique: true }),
    kind: field.enum(["stock","digital"]),
    price: field.float(),
    stock: field.int({ required: false }),
    description: field.text({ required: false }),
    image: field.file(["image"], { required: false, maxBytes: 5242880 }),
    tags: field.multiselect(["new","sale","clearance"], { required: false }),
    categoryId: field.belongsTo("Category", { required: false, onDelete: "set null" }),
    active: field.boolean(),
    // generated:end
  },
});
