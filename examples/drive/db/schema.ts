/**
 * Drizzle schema entry point. drizzle-kit reads this file to generate
 * migrations, and `db/index.ts` passes it to the query builder.
 *
 * Add hand-written tables anywhere outside the generated block below.
 */

export * from "./auth-schema";
export * from "./flare-schema";

// generated:start hash=67d15e985ba5
export * from "./schema/files";
export * from "./schema/folders";
export * from "./relations";
// generated:end
