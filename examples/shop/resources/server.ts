// Server-only: resource name → descriptor and table (maintained by flare gen).
// generated:start hash=62939793dd37
import { categories, customers, orders, orderItems, products } from "@/db/schema";
import { categoryResource, customerResource, orderResource, orderItemResource, productResource } from "./index";

export const resourceTables = {
  Category: { resource: categoryResource, table: categories },
  Customer: { resource: customerResource, table: customers },
  Order: { resource: orderResource, table: orders },
  OrderItem: { resource: orderItemResource, table: orderItems },
  Product: { resource: productResource, table: products },
} as const;

export type ResourceName = keyof typeof resourceTables;
// generated:end
