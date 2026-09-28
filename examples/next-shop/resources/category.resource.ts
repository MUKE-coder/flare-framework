import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Category",
  icon: "tag",
  group: "Catalogue",
  fields: {
    // generated:start hash=764cd26fffe5
    name: field.string({ unique: true }),
    slug: field.string({ unique: true }),
    description: field.text({ required: false }),
    image: field.file(["image"], { required: false, maxBytes: 5242880 }),
    // generated:end
  },
});
