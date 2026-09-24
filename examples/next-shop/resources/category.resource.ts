import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Category",
  icon: "tag",
  group: "Catalogue",
  fields: {
    // generated:start hash=7854f5c68880
    name: field.string({ unique: true }),
    slug: field.string({ unique: true }),
    description: field.text({ required: false }),
    // generated:end
  },
});
