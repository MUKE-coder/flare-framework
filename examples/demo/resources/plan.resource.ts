import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Plan",
  fields: {
    // generated:start hash=f6c7eedf93f8
    name: field.string(),
    slug: field.string({ unique: true }),
    description: field.text({ required: false }),
    stripeProductId: field.string({ required: false }),
    stripePriceId: field.string({ unique: true }),
    amount: field.int(),
    currency: field.string(),
    interval: field.enum(["month","year"], { required: false }),
    active: field.boolean({ required: false }),
    sort: field.int({ required: false }),
    // generated:end
  },
});
