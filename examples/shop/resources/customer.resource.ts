import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Customer",
  icon: "users",
  group: "Sales",
  fields: {
    // generated:start hash=c8ddb05b50bc
    name: field.string(),
    email: field.string({ unique: true, format: "email" }),
    phone: field.string({ required: false, format: "tel" }),
    notes: field.text({ required: false }),
    // generated:end
  },
});
