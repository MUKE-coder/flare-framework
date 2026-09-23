import { count } from "drizzle-orm";
import { defineResource, field } from "@flaredev/core";
import { orders } from "@/db/schema";

export default defineResource({
  name: "Order",
  icon: "receipt",
  group: "Sales",
  fields: {
    // generated:start hash=db4e33a51294
    reference: field.string({ unique: true }),
    customerId: field.belongsTo("Customer", { required: false, onDelete: "set null" }),
    channel: field.enum(["online","pos"]),
    status: field.enum(["pending","paid","fulfilled","refunded"]),
    total: field.float(),
    paidWith: field.enum(["cash","card","mobile"], { required: false }),
    note: field.text({ required: false }),
    // generated:end
  },
  hooks: {
    /** Orders are numbered, not named: SHOP-000001, in the order they were taken. */
    async beforeCreate(input, { db }) {
      if (input.reference) return input;
      const [row] = await db.select({ total: count() }).from(orders);
      return { ...input, reference: `SHOP-${String((row?.total ?? 0) + 1).padStart(6, "0")}` };
    },
  },
});
