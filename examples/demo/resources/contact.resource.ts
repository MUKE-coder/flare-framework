import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Contact",
  icon: "users",
  fields: {
    // generated:start hash=2b295da907ce
    name: field.string(),
    email: field.string({ format: "email" }),
    phone: field.string({ required: false }),
    status: field.enum(["lead","pending","customer","churned"], { required: false }),
    vip: field.boolean({ required: false }),
    // generated:end
  },
});
