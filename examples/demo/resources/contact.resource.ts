import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Contact",
  icon: "users",
  fields: {
    // generated:start hash=f1033d1e576b
    name: field.string(),
    email: field.string({ unique: true, format: "email" }),
    status: field.enum(["lead","customer"]),
    // generated:end
  },
});
