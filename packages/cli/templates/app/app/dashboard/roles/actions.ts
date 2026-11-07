"use server";

import { revalidatePath } from "next/cache";
import { createRole, deleteRole, setGrant } from "@/lib/permissions";
import { ADMIN_ROLES, dashboardSession } from "@/lib/dashboard";

/**
 * Changing who may do what.
 *
 * Admin only, and deliberately not policy-driven: these actions decide what the
 * policies themselves allow, so gating them on a policy would be circular. ADMIN_ROLES
 * (lib/dashboard.ts) is the one list that governs the app's own settings.
 */

export type RoleActionResult = { ok: true } | { ok: false; error: string };

const ROLE_NAME = /^[a-z][a-z0-9_-]{0,31}$/;
const ACTIONS = new Set(["read", "create", "update", "delete"]);

async function requireAdmin(): Promise<RoleActionResult | undefined> {
  const { session, role } = await dashboardSession();
  if (!session) return { ok: false, error: "You're signed out." };
  if (!role || !ADMIN_ROLES.includes(role)) return { ok: false, error: "Only an admin can change roles." };
}

export async function createRoleAction(input: { name: string; label: string }): Promise<RoleActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const name = input.name.trim().toLowerCase();
  if (!ROLE_NAME.test(name)) {
    return { ok: false, error: "A role is lowercase letters, digits, _ or -, starting with a letter — e.g. support-agent." };
  }
  await createRole(name, input.label.trim() || name);
  revalidatePath("/dashboard/roles");
  return { ok: true };
}

export async function deleteRoleAction(name: string): Promise<RoleActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  // Not admin: the role this screen is gated on cannot be removed from this screen,
  // which is the one mistake here that cannot be undone from the dashboard.
  if (ADMIN_ROLES.includes(name)) return { ok: false, error: `"${name}" runs this screen, so it can't be deleted here.` };
  await deleteRole(name);
  revalidatePath("/dashboard/roles");
  return { ok: true };
}

export async function setGrantAction(input: { role: string; resource: string; action: string; granted: boolean }): Promise<RoleActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!ROLE_NAME.test(input.role)) return { ok: false, error: `"${input.role}" is not a role name.` };
  if (!ACTIONS.has(input.action)) return { ok: false, error: `"${input.action}" is not an action.` };
  await setGrant(input.role, input.resource, input.action, input.granted);
  revalidatePath("/dashboard/roles");
  return { ok: true };
}
