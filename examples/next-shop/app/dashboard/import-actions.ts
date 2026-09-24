"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { can, type PolicyAction } from "@flaredev/core";
import type { Failure } from "@flaredev/core/server";
import { resourcePath, dashboardSession, dashboardStore, policyFor } from "@/lib/dashboard";
import type { ActionResult } from "./actions";

/** One row that couldn't be saved, numbered from 1 within the batch that was sent. */
export interface ImportFailure {
  row: number;
  error: string;
  field?: string;
}

export interface ImportSummary {
  created: number;
  failed: ImportFailure[];
}

/** Rows accepted per call. The browser splits a file into batches of this size or smaller. */
const MAX_ROWS = 5000;

/** How many consecutive failures at the start of a batch count as a mis-mapped file. */
const GIVE_UP_AFTER = 25;

const forbidden = (message = "You don't have access to the admin."): ActionResult<never> => ({ ok: false, status: 403, error: message });

/** Session + policy check for one action on one resource. */
async function allowed(resourceName: string, action: PolicyAction): Promise<ActionResult<never> | undefined> {
  const { allowed: inAdmin, role } = await dashboardSession();
  if (!inAdmin) return forbidden();
  if (!can(policyFor(resourceName), role, action)) return forbidden(`Your role can't ${action} this record.`);
}

/** A store failure as one line of text, attributed to a field when the issues name one. */
function describe(failure: Failure): { error: string; field?: string } {
  const issues = failure.issues ?? [];
  if (issues.length === 0) return { error: failure.error, field: failure.field };
  return {
    error: issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message)).join("; "),
    field: issues[0]?.path.split(".")[0] || failure.field,
  };
}

/**
 * Creates one batch of imported records and reports what happened to each row.
 *
 * Rows go through `store.create` one at a time rather than a bulk insert so an import
 * gets the same validation, defaults, generated ids and change hooks as the API and the
 * admin form; a bulk insert would let a CSV write values no other route can.
 */
export async function importRecordsAction(resourceName: string, rows: Record<string, unknown>[]): Promise<ActionResult<ImportSummary>> {
  const denied = await allowed(resourceName, "create");
  if (denied) return denied;

  if (rows.length > MAX_ROWS) {
    return { ok: false, status: 413, error: `This import sent ${rows.length} rows at once. Send at most ${MAX_ROWS} rows per batch.` };
  }

  const store = dashboardStore(resourceName);
  const failed: ImportFailure[] = [];
  let created = 0;

  for (const [index, row] of rows.entries()) {
    const result = await store.create(row);
    if (result.ok) {
      created += 1;
    } else {
      failed.push({ row: index + 1, ...describe(result) });
    }

    // Columns mapped to the wrong fields fail every row, so a long file would spend
    // thousands of writes proving the same point. A short batch runs to the end, where
    // the per-row report is more use than an early exit.
    if (created === 0 && failed.length === GIVE_UP_AFTER && rows.length > GIVE_UP_AFTER) {
      return {
        ok: false,
        status: 422,
        error: `The first ${GIVE_UP_AFTER} rows all failed, so nothing was imported. Check the column mapping — the first row said: ${failed[0]?.error ?? "no reason given"}`,
      };
    }
  }

  if (created > 0) {
    await recordAudit({ action: "import", resource: resourceName, changes: { created, failed: failed.length } });
    revalidatePath(resourcePath(store.resource));
  }
  return { ok: true, data: { created, failed } };
}
