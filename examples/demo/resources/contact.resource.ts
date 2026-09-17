import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Contact",
  fields: {
    // generated:start
    name: field.string(),
    email: field.string({ format: "email" }),
    // generated:end
  },
});
