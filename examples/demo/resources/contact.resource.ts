import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Contact",
  fields: {
    // generated:start hash=01371baa5af9
    name: field.string(),
    email: field.string({ format: "email" }),
    phone: field.string({ required: false }),
    // generated:end
  },
});
