import { definePolicy } from "@flaredev/core";

/**
 * Who may do what with Product records. Roles come from `flare role:add`;
 * "*" means any signed-in user. The API layer and the admin UI both read this.
 */
export default definePolicy({
  resource: "Product",
  // generated:start hash=f497902efa7c
  read: ["admin", "staff"],
  create: ["admin", "staff"],
  update: ["admin", "staff"],
  delete: ["admin"],
  // generated:end
});
