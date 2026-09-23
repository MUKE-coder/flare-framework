// Drizzle relations for every resource (maintained by flare gen).
// generated:start hash=a85a3d886eee
import { relations } from "drizzle-orm";
import { categories } from "./schema/categories";
import { customers } from "./schema/customers";
import { orderItems } from "./schema/order_items";
import { orders } from "./schema/orders";
import { products } from "./schema/products";

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id], relationName: "order_items_order_id" }),
  product: one(products, { fields: [orderItems.productId], references: [products.id], relationName: "order_items_product_id" }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id], relationName: "orders_customer_id" }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id], relationName: "products_category_id" }),
}));
// generated:end
