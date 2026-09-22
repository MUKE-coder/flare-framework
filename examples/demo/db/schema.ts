/**
 * Drizzle schema entry point. drizzle-kit reads this file to generate
 * migrations, and `db/index.ts` passes it to the query builder.
 *
 * Add hand-written tables anywhere outside the generated block below.
 */

export * from "./auth-schema";
export * from "./flare-schema";

// generated:start hash=a8242b0d8ea9
export * from "./schema/companies";
export * from "./schema/contacts";
export * from "./schema/customers";
export * from "./schema/deals";
export * from "./schema/plans";
export * from "./schema/purchases";
export * from "./schema/security_events";
export * from "./schema/vendors";
export * from "./relations";
// generated:end
