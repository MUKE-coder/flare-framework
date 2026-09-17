import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Company",
  fields: {
    // generated:start
    name: field.string({ unique: true }),
    deals: field.hasMany("Deal"),
    // generated:end
  },
});
