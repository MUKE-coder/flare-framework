/**
 * Drizzle schema entry point. drizzle-kit reads this file to generate
 * migrations, and `db/index.ts` passes it to the query builder.
 *
 * Add hand-written tables anywhere outside the generated block below.
 */

export * from "./auth-schema";

// generated:start
export * from "./schema/companies";
export * from "./schema/contacts";
export * from "./schema/deals";
export * from "./relations";
// generated:end
