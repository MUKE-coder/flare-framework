import { definePolicy } from "@flare/core";

/**
 * Who may do what with Deal records. Roles come from `flare role:add`;
 * "*" means any signed-in user. The API layer and the admin UI both read this.
 */
export default definePolicy({
  resource: "Deal",
  // generated:start hash=fc84c2e9b460
  read: ["admin","staff"],
  create: ["admin","staff"],
  update: ["admin","staff"],
  delete: ["admin"],
  // generated:end
});
