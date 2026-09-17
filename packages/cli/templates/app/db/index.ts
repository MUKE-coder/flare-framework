import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/** Drizzle client bound to the `DB` D1 binding. Call inside a request (server component, route handler, action). */
export function getDb() {
  return drizzle(env.DB, { schema });
}

export { schema };
