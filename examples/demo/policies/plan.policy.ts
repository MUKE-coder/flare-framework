import { definePolicy } from "@flaredev/core";

/**
 * Who may do what with Plan records. Roles come from `flare role:add`;
 * "*" means any signed-in user. The API layer and the admin UI both read this.
 */
export default definePolicy({
  resource: "Plan",
  // generated:start hash=86324e536b54
  read: ["*"],
  create: ["admin"],
  update: ["admin"],
  delete: ["admin"],
  // generated:end
});
