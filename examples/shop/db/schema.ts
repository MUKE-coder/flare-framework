/**
 * Drizzle schema entry point. drizzle-kit reads this file to generate
 * migrations, and `db/index.ts` passes it to the query builder.
 *
 * Add hand-written tables anywhere outside the generated block below.
 */

export * from "./auth-schema";
export * from "./flare-schema";

// generated:start hash=7ba3b7359374
export * from "./schema/categories";
export * from "./schema/customers";
export * from "./schema/order_items";
export * from "./schema/orders";
export * from "./schema/products";
export * from "./relations";
// generated:end
