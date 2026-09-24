import { prisma } from "@/lib/db";

/** Is the app up, and can it reach the database? */
export async function GET() {
  const rows = (await prisma.$queryRaw`select 1 as ok`) as { ok: number }[];
  return Response.json({ ok: true, database: rows[0]?.ok === 1 });
}
