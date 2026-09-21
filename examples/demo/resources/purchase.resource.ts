import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Purchase",
  fields: {
    // generated:start hash=cbd3eca04875
    customerId: field.belongsTo("Customer"),
    planId: field.belongsTo("Plan", { required: false, onDelete: "set null" }),
    stripeCheckoutSessionId: field.string({ unique: true }),
    amount: field.int(),
    currency: field.string(),
    status: field.enum(["pending","paid","failed"]),
    // generated:end
  },
});
