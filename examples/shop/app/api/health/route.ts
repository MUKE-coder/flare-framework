import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function GET() {
  const [row] = await getDb().all<{ ok: number }>(sql`select 1 as ok`);
  return Response.json({ ok: true, database: row?.ok === 1 });
}
