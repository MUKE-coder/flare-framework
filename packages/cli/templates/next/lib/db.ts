import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * The Prisma client, one per process.
 *
 * Prisma 7 needs a driver adapter rather than a connection string in the schema. This
 * one is the ordinary Postgres driver, which talks to anything that speaks Postgres:
 * Neon's pooled endpoint, Supabase, RDS, or the container you run while developing.
 * Next runs on Node, so there is nothing to gain from a serverless HTTP driver and a
 * great deal to lose — `@prisma/adapter-neon` can't reach a database on localhost.
 *
 * Next reloads modules on every edit in development, and a fresh client each time would
 * exhaust the connection limit within a few saves; hence the global.
 */
const makeClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof makeClient> };

export const prisma = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Named to match the Cloudflare stack, so code that takes a database reads the same. */
export const getDb = () => prisma;
