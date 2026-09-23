import { eq, sql } from "drizzle-orm";
import { defineResource, field } from "@flaredev/core";
import { products } from "@/db/schema";

export default defineResource({
  name: "OrderItem",
  icon: "list",
  group: "Sales",
  fields: {
    // generated:start hash=db0d8a264175
    orderId: field.belongsTo("Order"),
    productId: field.belongsTo("Product"),
    name: field.string(),
    quantity: field.int(),
    unitPrice: field.float(),
    // generated:end
  },
  computed: {
    /** What this line costs. Worked out rather than stored, so it can't drift. */
    lineTotal: (item) => Number(item.quantity) * Number(item.unitPrice),
  },
  hooks: {
    /**
     * Selling a stock product takes it off the shelf. A digital product has no shelf,
     * so its stock stays null and nothing is decremented.
     */
    async afterCreate(item, { db }) {
      const [product] = await db.select().from(products).where(eq(products.id, String(item.productId))).limit(1);
      if (product?.kind !== "stock") return;
      await db
        .update(products)
        .set({ stock: sql`max(0, coalesce(${products.stock}, 0) - ${Number(item.quantity)})` })
        .where(eq(products.id, String(item.productId)));
    },
  },
});
