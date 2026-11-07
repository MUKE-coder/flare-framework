"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { dashboardSession } from "@/lib/dashboard";

/**
 * Managing accounts, through Better Auth's admin API.
 *
 * The same `admin` plugin that gives users a role also enforces who may call these:
 * only roles in its `adminRoles` (see lib/auth.ts — "admin" out of the box). The check
 * here is only for a clean sentence; the API would refuse anyway, which means these
 * actions are exactly as powerful as the `flare user:add` / `flare user:role` commands
 * and no more.
 */

export type UserActionResult = { ok: true } | { ok: false; error: string };

function failed(error: unknown): UserActionResult {
  const message = error instanceof Error ? error.message : String(error);
  // Better Auth's refusal for a non-admin caller, said in this page's words.
  if (/not.*(allowed|permitted)|unauthorized|forbidden/i.test(message)) {
    return { ok: false, error: "Only an admin can manage accounts." };
  }
  return { ok: false, error: message || "That didn't work." };
}

async function signedIn(): Promise<UserActionResult | undefined> {
  const { session } = await dashboardSession();
  if (!session) return { ok: false, error: "You're signed out." };
}

/** Make an account, exactly as `flare user:add` would: usable immediately. */
export async function createUserAction(input: { name: string; email: string; password: string; role: string }): Promise<UserActionResult> {
  const out = await signedIn();
  if (out) return out;
  const role = input.role.trim() || "user";
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(role)) {
    return { ok: false, error: "A role is lowercase letters, digits, _ or -, e.g. admin or support-agent." };
  }
  try {
    await auth.api.createUser({
      body: { name: input.name.trim(), email: input.email.trim(), password: input.password, role: role as "user" },
      headers: await headers(),
    });
  } catch (error) {
    return failed(error);
  }
  revalidatePath("/dashboard/users");
  return { ok: true };
}

/** Change what someone is allowed to do. Takes effect on their next request. */
export async function setRoleAction(input: { userId: string; role: string }): Promise<UserActionResult> {
  const out = await signedIn();
  if (out) return out;
  const role = input.role.trim();
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(role)) {
    return { ok: false, error: "A role is lowercase letters, digits, _ or -, e.g. admin or support-agent." };
  }
  try {
    await auth.api.setRole({ body: { userId: input.userId, role: role as "user" }, headers: await headers() });
  } catch (error) {
    return failed(error);
  }
  revalidatePath("/dashboard/users");
  return { ok: true };
}

/** A banned account keeps its data and loses its way in; unban restores it. */
export async function setBannedAction(input: { userId: string; banned: boolean }): Promise<UserActionResult> {
  const out = await signedIn();
  if (out) return out;
  try {
    if (input.banned) {
      await auth.api.banUser({ body: { userId: input.userId }, headers: await headers() });
    } else {
      await auth.api.unbanUser({ body: { userId: input.userId }, headers: await headers() });
    }
  } catch (error) {
    return failed(error);
  }
  revalidatePath("/dashboard/users");
  return { ok: true };
}
