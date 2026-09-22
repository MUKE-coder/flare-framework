import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Vendor",
  fields: {
    // generated:start hash=fc632ba9a0dd
    name: field.string(),
    email: field.string({ format: "email" }),
    phone: field.string({ required: false, format: "tel" }),
    website: field.string({ required: false, format: "url" }),
    domain: field.string({ required: false, format: "domain" }),
    country: field.string({ required: false, format: "country" }),
    brandColor: field.string({ required: false, format: "color" }),
    handle: field.string({ required: false, unique: true, format: "slug" }),
    tier: field.enum(["bronze","silver","gold"], { widget: "radio" }),
    services: field.multiselect(["design","build","hosting","support"], { required: false }),
    // generated:end
  },
});
