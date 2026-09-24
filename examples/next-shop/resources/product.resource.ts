import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Product",
  icon: "package",
  group: "Catalogue",
  fields: {
    // generated:start hash=91e393fbd0db
    name: field.string(),
    sku: field.string({ unique: true }),
    kind: field.enum(["stock","digital"]),
    price: field.float(),
    stock: field.int({ required: false }),
    description: field.text({ required: false }),
    tags: field.multiselect(["new","sale","clearance"], { required: false }),
    categoryId: field.belongsTo("Category", { required: false, onDelete: "set null" }),
    active: field.boolean(),
    // generated:end
  },
});
