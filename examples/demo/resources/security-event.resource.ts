import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "SecurityEvent",
  fields: {
    // generated:start hash=430318244b3e
    kind: field.string(),
    severity: field.enum(["low","medium","high"]),
    ip: field.string(),
    path: field.string(),
    userAgent: field.text({ required: false }),
    count: field.int(),
    banned: field.boolean({ required: false }),
    detail: field.text({ required: false }),
    // generated:end
  },
});
