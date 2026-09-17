import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Deal",
  icon: "briefcase",
  fields: {
    // generated:start hash=9476bbd4e55d
    title: field.string(),
    amount: field.float({ required: false }),
    companyId: field.belongsTo("Company"),
    ownerId: field.belongsTo("Contact", { required: false, onDelete: "set null" }),
    closeOn: field.date({ required: false }),
    contract: field.file(["pdf","image"], { required: false }),
    // generated:end
  },
});
