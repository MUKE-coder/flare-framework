import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Deal",
  fields: {
    // generated:start
    title: field.string(),
    amount: field.float({ required: false }),
    companyId: field.belongsTo("Company"),
    ownerId: field.belongsTo("Contact", { required: false, onDelete: "set null" }),
    // generated:end
  },
});
