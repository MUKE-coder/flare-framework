import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Order",
  icon: "receipt",
  group: "Sales",
  fields: {
    // generated:start hash=7a33c01be677
    reference: field.string({ unique: true }),
    customerEmail: field.string({ format: "email" }),
    status: field.enum(["pending","paid","shipped","refunded"]),
    total: field.float(),
    note: field.text({ required: false }),
    // generated:end
  },
});
