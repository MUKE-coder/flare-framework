import { definePolicy } from "@flare/core";

/**
 * Who may do what with Purchase records. Roles come from `flare role:add`;
 * "*" means any signed-in user. The API layer and the admin UI both read this.
 */
export default definePolicy({
  resource: "Purchase",
  // generated:start hash=92944358f217
  read: ["admin", "staff"],
  create: ["admin"],
  update: ["admin"],
  delete: ["admin"],
  // generated:end
});
