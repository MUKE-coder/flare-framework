import { Redis } from "@upstash/redis";

/**
 * Upstash Redis, over HTTP.
 *
 * Next's own data cache (`cached()` in lib/cache.ts) handles query caching. This is for
 * the things a cache can't do: rate limits, locks, anything that has to be true across
 * every instance at once. It talks HTTP rather than a socket, so a serverless function
 * needs no connection pool.
 *
 * Unset credentials give you `null` rather than a crash, so an app that doesn't use it
 * doesn't have to configure it.
 */
export const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;
