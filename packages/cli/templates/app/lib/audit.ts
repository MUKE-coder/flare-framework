import { headers } from "next/headers";
import { desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/flare-schema";
import { dashboardSession } from "./dashboard";

export type AuditAction = "create" | "update" | "delete" | "import" | "bulk-delete";

export interface AuditEntry {
  action: AuditAction;
  resource: string;
  recordId?: string | null;
  recordLabel?: string | null;
  changes?: Record<string, unknown> | null;
}

/**
 * Record a change in the audit log.
 *
 * Never throws: an audit trail that can take the write down with it is worse than one
 * with a gap, and the caller has already changed the database by the time we're here.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const { session } = await dashboardSession();
    const headerList = await headers();
    await getDb()
      .insert(auditLog)
      .values({
        action: entry.action,
        resource: entry.resource,
        recordId: entry.recordId ?? null,
        recordLabel: entry.recordLabel ?? null,
        userId: session?.user.id ?? null,
        userEmail: session?.user.email ?? null,
        changes: entry.changes ?? null,
        ip: headerList.get("cf-connecting-ip") ?? null,
      });
  } catch {
    // Deliberately quiet.
  }
}

/** Which fields moved, and from what to what. Only the differences, never the whole record. */
export function diffFields(before: Record<string, unknown> | null | undefined, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(after)) {
    if (key === "updatedAt" || key === "createdAt") continue;
    const previous = before?.[key];
    const same = JSON.stringify(previous ?? null) === JSON.stringify(value ?? null);
    if (!same) changes[key] = { from: previous ?? null, to: value ?? null };
  }
  return changes;
}

export interface AuditRow {
  id: string;
  action: string;
  resource: string;
  recordId: string | null;
  recordLabel: string | null;
  userEmail: string | null;
  changes: Record<string, unknown> | null;
  createdAt: Date;
}

/** The most recent entries, newest first. */
export async function recentAudit(limit = 25, resource?: string): Promise<AuditRow[]> {
  const db = getDb();
  const query = db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
  const rows = resource ? await query.where(eq(auditLog.resource, resource)) : await query;
  return rows as AuditRow[];
}

/** How many changes were recorded in the last `days` days, for the observability summary. */
export async function auditCount(days = 7): Promise<number> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [row] = await getDb().select({ total: sql<number>`count(*)` }).from(auditLog).where(gte(auditLog.createdAt, since));
  return row?.total ?? 0;
}
