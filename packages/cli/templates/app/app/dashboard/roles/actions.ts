"use server";

import { revalidatePath } from "next/cache";
import { createRole, deleteRole, setGrant } from "@/lib/permissions";
import { findArea, type AreaAction } from "@/lib/areas";
import { ADMIN_ROLES, allResources, canArea } from "@/lib/dashboard";

/**
 * Changing who may do what.
 *
 * Gated on the Roles area rather than on ADMIN_ROLES directly, so an app can hand this
 * screen to a second role — the admin floor still applies, and nothing granted here can
 * reach past it. The caution on the Roles row says the obvious out loud: a role that may
 * change this screen can grant itself the rest of it.
 */

export type RoleActionResult = { ok: true } | { ok: false; error: string };

const ROLE_NAME = /^[a-z][a-z0-9_-]{0,31}$/;
const ACTIONS = new Set(["read", "create", "update", "delete"]);

async function requireRoleAdmin(): Promise<RoleActionResult | undefined> {
  if (!(await canArea("@roles", "update"))) return { ok: false, error: "You can't change roles." };
}

export async function createRoleAction(input: { name: string; label: string }): Promise<RoleActionResult> {
  const denied = await requireRoleAdmin();
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
  const denied = await requireRoleAdmin();
  if (denied) return denied;
  // Not admin: the role this screen is gated on cannot be removed from this screen,
  // which is the one mistake here that cannot be undone from the dashboard.
  if (ADMIN_ROLES.includes(name)) return { ok: false, error: `"${name}" runs this screen, so it can't be deleted here.` };
  await deleteRole(name);
  revalidatePath("/dashboard/roles");
  return { ok: true };
}

export async function setGrantAction(input: { role: string; resource: string; action: string; granted: boolean }): Promise<RoleActionResult> {
  const denied = await requireRoleAdmin();
  if (denied) return denied;
  if (!ROLE_NAME.test(input.role)) return { ok: false, error: `"${input.role}" is not a role name.` };
  if (!ACTIONS.has(input.action)) return { ok: false, error: `"${input.action}" is not an action.` };

  // The target has to be something that exists — a resource of this app, or one of the
  // dashboard's own pages. Without this the table would accept any string, and a typo
  // would be stored forever as a permission on nothing.
  const action = input.action as AreaAction;
  const area = findArea(input.resource);
  if (area) {
    if (!area.actions.includes(action) || area.locked?.[action]) {
      return { ok: false, error: `${area.label} doesn't take a "${input.action}" grant.` };
    }
  } else if (!allResources().some((resource) => resource.name === input.resource)) {
    return { ok: false, error: `"${input.resource}" is not a resource or a page of this dashboard.` };
  }

  await setGrant(input.role, input.resource, input.action, input.granted);
  revalidatePath("/dashboard/roles");
  return { ok: true };
}
