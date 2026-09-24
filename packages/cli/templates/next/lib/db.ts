import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * The Prisma client, one per process.
 *
 * Prisma 7 needs a driver adapter rather than a connection string in the schema, and
 * Neon's is an HTTP driver — no pooling to arrange, which is what makes it work in a
 * serverless function that may only live for one request.
 *
 * Next reloads modules on every edit in development, and a fresh client each time would
 * exhaust the connection limit within a few saves; hence the global.
 */
const makeClient = () => new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof makeClient> };

export const prisma = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Named to match the Cloudflare stack, so code that takes a database reads the same. */
export const getDb = () => prisma;
