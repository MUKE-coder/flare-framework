import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Company",
  icon: "building",
  fields: {
    // generated:start
    name: field.string({ unique: true }),
    deals: field.hasMany("Deal"),
    // generated:end
  },
});
