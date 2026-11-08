"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { canArea, requireArea } from "@/lib/dashboard";
import { createInvitation, invitationLink, revokeInvitation } from "@/lib/invitations";

/**
 * Issuing and revoking invitations.
 *
 * Both follow the Invitations row on the roles screen — issuing is its `create` grant,
 * revoking its `delete` — and are checked here rather than trusted from the page: a
 * server action is an endpoint, and an endpoint that relies on not being linked to is
 * not protected.
 */
async function allow(action: "create" | "delete"): Promise<void> {
  await requireArea("@dashboard-invitations");
  if (!(await canArea("@dashboard-invitations", action))) {
    throw new Error(action === "create" ? "Your role cannot issue invitations." : "Your role cannot revoke invitations.");
  }
}

/** The app's own origin, from the request, so the link works wherever it is deployed. */
async function origin(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const scheme = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${scheme}://${host}`;
}

export interface IssuedInvitation {
  link: string;
  email: string | null;
  expiresAt: string;
}

/**
 * Create one and return the link.
 *
 * Returned rather than emailed, and shown once: the token is not stored, so there is no
 * second chance to read it. Send it however you like — that keeps this working in an app
 * with no mail configured, which a fresh app is.
 */
export async function issueInvitation(formData: FormData): Promise<IssuedInvitation> {
  await allow("create");
  const raw = String(formData.get("email") ?? "").trim();
  const days = Number(formData.get("days")) || undefined;
  const invitation = await createInvitation({ for: raw ? { email: raw } : { anyone: true }, days });
  revalidatePath("/dashboard/invitations");
  return {
    link: invitationLink(await origin(), invitation.token),
    email: invitation.email,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

/** Revoke one, so a link sent to the wrong address stops working. */
export async function cancelInvitation(id: string): Promise<void> {
  await allow("delete");
  await revokeInvitation(id);
  revalidatePath("/dashboard/invitations");
}
