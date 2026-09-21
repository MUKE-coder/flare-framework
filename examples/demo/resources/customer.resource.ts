import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Customer",
  fields: {
    // generated:start hash=030452d9591d
    name: field.string(),
    email: field.string({ unique: true, format: "email" }),
    userId: field.string({ required: false, unique: true }),
    stripeCustomerId: field.string({ required: false, unique: true }),
    stripeSubscriptionId: field.string({ required: false }),
    subscriptionStatus: field.enum(["none","incomplete","trialing","active","past_due","paused","canceled","unpaid"], { required: false }),
    subscriptionEndsAt: field.datetime({ required: false }),
    cancelAtPeriodEnd: field.boolean({ required: false }),
    planId: field.belongsTo("Plan", { required: false, onDelete: "set null" }),
    // generated:end
  },
});
